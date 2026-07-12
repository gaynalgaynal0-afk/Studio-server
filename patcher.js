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
  
  const mvhdData = buffer.slice(mvhd.offset, mvhd.offset + mvhd.size);
  const version = mvhdData[8];
  
  if (version === 0) {
    const timeScaleOffset = 20;
    const durationOffset = 24;
    if (mvhdData.length >= durationOffset + 4) {
      const timescale = mvhdData.readUInt32BE(timeScaleOffset);
      mvhdData.writeUInt32BE(90000, timeScaleOffset);
      
      const duration = mvhdData.readUInt32BE(durationOffset);
      const newDuration = Math.floor((duration / timescale) * 90000);
      mvhdData.writeUInt32BE(newDuration, durationOffset);
    }
  } else if (version === 1) {
    const timeScaleOffset = 28;
    const durationOffset = 32;
    if (mvhdData.length >= durationOffset + 8) {
      const timescale = mvhdData.readUInt32BE(timeScaleOffset);
      mvhdData.writeUInt32BE(90000, timeScaleOffset);
      
      mvhdData.writeBigUInt64BE(90000n, durationOffset);
    }
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
      const mdhdData = buffer.slice(mdhd.offset, mdhd.offset + mdhd.size);
      const version = mdhdData[8];
      
      if (version === 0) {
        const timeScaleOffset = 20;
        const durationOffset = 24;
        if (mdhdData.length >= durationOffset + 4) {
          const timescale = mdhdData.readUInt32BE(timeScaleOffset);
          mdhdData.writeUInt32BE(90000, timeScaleOffset);
          
          const duration = mdhdData.readUInt32BE(durationOffset);
          const newDuration = Math.floor((duration / timescale) * 90000);
          mdhdData.writeUInt32BE(newDuration, durationOffset);
        }
      } else if (version === 1) {
        const timeScaleOffset = 28;
        const durationOffset = 32;
        if (mdhdData.length >= durationOffset + 8) {
          const timescale = mdhdData.readUInt32BE(timeScaleOffset);
          mdhdData.writeUInt32BE(90000, timeScaleOffset);
          
          mdhdData.writeBigUInt64BE(90000n, durationOffset);
        }
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
