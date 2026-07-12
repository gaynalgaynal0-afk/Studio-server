const FAKE_SAMPLE = Buffer.from([0,0,0,4,0,0,0,0]);
const CONTAINERS = new Set(["moov","trak","mdia","minf","stbl","edts","dinf","udta","meta","ilst"]);

const u32=(b,o)=>b.readUInt32BE(o);
const u64=(b,o)=>Number(b.readBigUInt64BE(o));
const w32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n>>>0,0);return b;}
const box=(t,p)=>Buffer.concat([w32(p.length+8),Buffer.from(t,"latin1"),p]);
const boxType=(b,o)=>b.toString("latin1",o+4,o+8);

function sizeAt(b,o,end){
  if(o+8>end)return 0;
  const s=u32(b,o);
  if(s===1){ if(o+16>end)return 0; return u64(b,o+8);}
  if(s===0)return end-o;
  return s;
}

function parseBoxes(buf,start,end){
  const out=[]; let off=start;
  while(off+8<=end){
    const size=sizeAt(buf,off,end);
    if(!size||off+size>end) break;
    const type=boxType(buf,off);
    const header=u32(buf,off)===1?16:8;
    const node={type,start:off,end:off+size,header,children:null};
    let inner=off+header;
    if(type==="meta") inner+=4;
    if(CONTAINERS.has(type)&&inner<off+size){
      node.children=parseBoxes(buf,inner,off+size);
    }
    out.push(node);
    off+=size;
  }
  return out;
}

const raw=(b,n)=>b.subarray(n.start,n.end);
const payload=(b,n)=>b.subarray(n.start+n.header,n.end);
const findChild=(n,t)=>(n.children||[]).find(c=>c.type===t);

function childPath(n,path){
  let cur=n;
  for(const p of path){
    cur=findChild(cur,p);
    if(!cur)return null;
  }
  return cur;
}

function isVideoTrak(buf,trak){
  const h=childPath(trak,["mdia","hdlr"]);
  return h && payload(buf,h).toString("latin1",8,12)==="vide";
}

function findStbl(trak){
  return childPath(trak,["mdia","minf","stbl"]);
}

function patchMdhd(buf,node){
  const p=Buffer.from(payload(buf,node));
  const off = p[0]===1 ? 28 : 16;
  if(off+2<=p.length) p.writeUInt16BE(21956,off);
  return box("mdhd",p);
}

function patchHdlr(buf,node){
  const p=Buffer.from(payload(buf,node));
  const type=p.toString("latin1",8,12);
  let name=null;
  if(type==="vide") name="VideoHandler\0";
  else if(type==="soun") name="SoundHandler\0";
  if(!name) return raw(buf,node);
  return box("hdlr",Buffer.concat([p.subarray(0,24),Buffer.from(name)]));
}

function patchStsz(buf,node,extra){
  const p=payload(buf,node);
  const count=u32(p,8);
  const sizes=[];

  for(let i=0;i<count;i++) sizes.push(8);
  for(let i=0;i<extra;i++) sizes.push(8);

  const out=Buffer.alloc(12+sizes.length*4);
  p.subarray(0,4).copy(out,0);
  out.writeUInt32BE(0,4);
  out.writeUInt32BE(sizes.length,8);
  sizes.forEach((s,i)=>out.writeUInt32BE(s,12+i*4));

  return box("stsz",out);
}

function patchStsc(buf,node,count){
  const out=Buffer.alloc(20);
  out.writeUInt32BE(0,0);
  out.writeUInt32BE(1,4);
  out.writeUInt32BE(1,8);
  out.writeUInt32BE(1,12);
  out.writeUInt32BE(1,16);
  return box("stsc",out);
}

function patchStco(buf,node,delta,mdatEnd,extra){
  const p=payload(buf,node);
  const count=u32(p,4);
  const offsets=[];
  for(let i=0;i<count;i++){
    offsets.push(u32(p,8+i*4)+delta);
  }
  for(let i=0;i<extra;i++) offsets.push(mdatEnd);

  const out=Buffer.alloc(8+offsets.length*4);
  p.subarray(0,4).copy(out,0);
  out.writeUInt32BE(offsets.length,4);
  offsets.forEach((v,i)=>out.writeUInt32BE(v,8+i*4));

  return box("stco",out);
}

function patchSharkSampleTableMethod(buffer){

  const boxes=parseBoxes(buffer,0,buffer.length);
  const moov=boxes.find(b=>b.type==="moov");
  const mdat=boxes.find(b=>b.type==="mdat");

  if(!moov||!mdat) throw new Error("Invalid MP4");

  const trak=(moov.children||[]).find(t=>t.type==="trak" && isVideoTrak(buffer,t));
  const stbl=findStbl(trak);

  const stsz=findChild(stbl,"stsz");
  const stco=findChild(stbl,"stco");
  const stsc=findChild(stbl,"stsc");

  const extra = 8; // balanced

  function rebuild(node,delta,mdatEnd){
    if(node.type==="mdhd") return patchMdhd(buffer,node);
    if(node.type==="hdlr") return patchHdlr(buffer,node);
    if(node.type==="stsz") return patchStsz(buffer,node,extra);
    if(node.type==="stsc") return patchStsc(buffer,node,extra);
    if(node.type==="stco") return patchStco(buffer,node,delta,mdatEnd,extra);

    if(node.children){
      const parts=node.children.map(c=>rebuild(c,delta,mdatEnd));
      return box(node.type,Buffer.concat(parts));
    }
    return raw(buffer,node);
  }

  let newMoov=rebuild(moov,0,mdat.end);
  let delta=newMoov.length-(moov.end-moov.start);
  let mdatEnd=mdat.end+delta;

  newMoov=rebuild(moov,delta,mdatEnd);

  const mdatData=buffer.subarray(mdat.start+8,mdat.end);
  const newMdat=Buffer.concat([
    w32(8+mdatData.length+8),
    Buffer.from("mdat"),
    mdatData,
    FAKE_SAMPLE
  ]);

  const out=[];
  for(const b of boxes){
    if(b.type==="moov") out.push(newMoov);
    else if(b.type==="mdat") out.push(newMdat);
    else out.push(raw(buffer,b));
  }

  return { output: Buffer.concat(out) };
}

module.exports = { patchSharkSampleTableMethod };
