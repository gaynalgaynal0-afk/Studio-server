/**
 * MP4 timestamp patcher — mvhd/mdhd timescale/duration tweaks
 * Reads/writes values in-place on the buffer, preserves all data
 */

function findBox(buffer, boxType, startOffset = 0) {
  const boxTypeBytes = Buffer.from(boxType, 'ascii');
  let offset = startOffset;
  
  while (offset < buffer.length - 8) {
    if (offset + 8 > buffer.length) break;
    
    const size = buffer.readUInt32BE(offset);
    if (size < 8) break;
    if (offset + size > buffer.length) break;
    
    // Check if this box matches
    if (buffer[offset + 4] === boxTypeBytes[0] &&
        buffer[offset + 5] === boxTypeBytes[1] &&
        buffer[offset + 6] === boxTypeBytes[2] &&
        buffer[offset + 7] === boxTypeBytes[3]) {
      return { offset, size };
    }
    
    offset += size;
  }
  
  return null;
}

async function patchVideo(inputBuffer) {
  try {
    // CRITICAL: Make a proper copy, don't mutate the input
    const output = Buffer.alloc(inputBuffer.length);
    inputBuffer.copy(output);
    
    console.log(`[Patcher] Input size: ${inputBuffer.length}, output buffer size: ${output.length}`);

    // Find moov box
    const ftyp = findBox(output, 'ftyp');
    const moovStart = ftyp ? ftyp.offset + ftyp.size : 0;
    const moov = findBox(output, 'moov', moovStart);
    
    if (!moov) {
      console.log('[Patcher] No moov box found, returning unmodified');
      return { output };
    }
    
    console.log(`[Patcher] Found moov at offset ${moov.offset}, size ${moov.size}`);

    // Patch mvhd
    const mvhdStart = moov.offset + 8;
    const mvhd = findBox(output, 'mvhd', mvhdStart);
    
    if (mvhd) {
      console.log(`[Patcher] Found mvhd at offset ${mvhd.offset}`);
      const version = output[mvhd.offset + 8];
      
      if (version === 0) {
        const tsOffset = mvhd.offset + 20;
        const durOffset = mvhd.offset + 24;
        
        const ts = output.readUInt32BE(tsOffset);
        output.writeUInt32BE(90000, tsOffset);
        
        const dur = output.readUInt32BE(durOffset);
        const newDur = Math.floor((dur / ts) * 90000);
        output.writeUInt32BE(newDur, durOffset);
        
        console.log(`[Patcher] mvhd v0: timescale ${ts}->${90000}, duration ${dur}->${newDur}`);
      } else if (version === 1) {
        const tsOffset = mvhd.offset + 28;
        const durOffset = mvhd.offset + 32;
        
        output.writeUInt32BE(90000, tsOffset);
        output.writeBigUInt64BE(90000n, durOffset);
        
        console.log(`[Patcher] mvhd v1: set timescale=90000`);
      }
    }

    // Patch all mdhd boxes in all trak boxes
    let trakOffset = moov.offset + 8;
    let trakCount = 0;
    
    while (trakOffset < moov.offset + moov.size) {
      const trak = findBox(output, 'trak', trakOffset);
      if (!trak) break;
      
      trakCount++;
      const mdhdStart = trak.offset + 8;
      const mdhd = findBox(output, 'mdhd', mdhdStart);
      
      if (mdhd) {
        console.log(`[Patcher] Found mdhd in trak ${trakCount} at offset ${mdhd.offset}`);
        const version = output[mdhd.offset + 8];
        
        if (version === 0) {
          const tsOffset = mdhd.offset + 20;
          const durOffset = mdhd.offset + 24;
          
          const ts = output.readUInt32BE(tsOffset);
          output.writeUInt32BE(90000, tsOffset);
          
          const dur = output.readUInt32BE(durOffset);
          const newDur = Math.floor((dur / ts) * 90000);
          output.writeUInt32BE(newDur, durOffset);
          
          console.log(`[Patcher] mdhd v0 trak${trakCount}: timescale ${ts}->${90000}, duration ${dur}->${newDur}`);
        } else if (version === 1) {
          const tsOffset = mdhd.offset + 28;
          const durOffset = mdhd.offset + 32;
          
          output.writeUInt32BE(90000, tsOffset);
          output.writeBigUInt64BE(90000n, durOffset);
          
          console.log(`[Patcher] mdhd v1 trak${trakCount}: set timescale=90000`);
        }
      }
      
      trakOffset = trak.offset + trak.size;
    }
    
    console.log(`[Patcher] Done. Output size: ${output.length} (expected ${inputBuffer.length})`);
    return { output };
    
  } catch (err) {
    console.error('[Patcher] ERROR:', err);
    throw err;
  }
}

module.exports = { patchVideo };
