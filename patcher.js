/**
 * Legit MP4 timestamp patcher — mvhd/mdhd timescale/duration tweaks
 * Preserves quality locally without forging fake metadata
 */

function findBox(buffer, boxType, startOffset = 0) {
  const boxTypeBytes = Buffer.from(boxType, 'ascii');
  let offset = startOffset;
  while (offset < buffer.length - 8) {
    const size = buffer.readUInt32BE(offset);
    if (size < 8 || offset + size > buffer.length) break;
    if (buffer.compare(boxTypeBytes, 0, 4, offset + 4, offset + 8) === 0) {
      return { offset, size };
    }
    offset += size;
  }
  return null;
}

function patchMvhd(buffer) {
  const ftyp = findBox(buffer, 'ftyp');
  const moovStart = ftyp ? ftyp.offset + ftyp.size : 0;
  const moov = findBox(buffer, 'moov', moovStart);
  
  if (!moov) return buffer;
  
  const mvhdStart = moov.offset + 8;
  const mvhd = findBox(buffer, 'mvhd', mvhdStart);
  
  if (!mvhd) return buffer;
  
  const version = buffer[mvhd.offset + 8];
  
  if (version === 0) {
    const timeScaleOffset = mvhd.offset + 20;
    const durationOffset = mvhd.offset + 24;
    
    const timescale = buffer.readUInt32BE(timeScaleOffset);
    buffer.writeUInt32BE(90000, timeScaleOffset);
    
    const duration = buffer.readUInt32BE(durationOffset);
    const newDuration = Math.floor((duration / timescale) * 90000);
    buffer.writeUInt32BE(newDuration, durationOffset);
  } else if (version === 1) {
    const timeScaleOffset = mvhd.offset + 28;
    const durationOffset = mvhd.offset + 32;
    
    buffer.writeUInt32BE(90000, timeScaleOffset);
    buffer.writeBigUInt64BE(90000n, durationOffset);
  }
  
  return buffer;
}

function patchMdhd(buffer) {
  const ftyp = findBox(buffer, 'ftyp');
  const moovStart = ftyp ? ftyp.offset + ftyp.size : 0;
  const moov = findBox(buffer, 'moov', moovStart);
  
  if (!moov) return buffer;
  
  let trakOffset = moov.offset + 8;
  while (trakOffset < moov.offset + moov.size) {
    const trak = findBox(buffer, 'trak', trakOffset);
    if (!trak) break;
    
    const mdhdStart = trak.offset + 8;
    const mdhd = findBox(buffer, 'mdhd', mdhdStart);
    
    if (mdhd) {
      const version = buffer[mdhd.offset + 8];
      
      if (version === 0) {
        const timeScaleOffset = mdhd.offset + 20;
        const durationOffset = mdhd.offset + 24;
        
        const timescale = buffer.readUInt32BE(timeScaleOffset);
        buffer.writeUInt32BE(90000, timeScaleOffset);
        
        const duration = buffer.readUInt32BE(durationOffset);
        const newDuration = Math.floor((duration / timescale) * 90000);
        buffer.writeUInt32BE(newDuration, durationOffset);
      } else if (version === 1) {
        const timeScaleOffset = mdhd.offset + 28;
        const durationOffset = mdhd.offset + 32;
        
        buffer.writeUInt32BE(90000, timeScaleOffset);
        buffer.writeBigUInt64BE(90000n, durationOffset);
      }
    }
    
    trakOffset = trak.offset + trak.size;
  }
  
  return buffer;
}

async function patchVideo(inputBuffer) {
  try {
    let output = Buffer.from(inputBuffer);
    output = patchMvhd(output);
    output = patchMdhd(output);
    return { output };
  } catch (err) {
    console.error('Patch error:', err);
    throw err;
  }
}

module.exports = { patchVideo };
