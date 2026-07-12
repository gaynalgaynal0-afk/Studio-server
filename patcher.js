const FAKE_SAMPLE_SIZE = 8;
const FAKE_SAMPLE_BYTES = Buffer.from([0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00]);
const VIDEO_TIMESCALE = 90000;
const VIDEO_EDIT_MEDIA_TIME = 0; 
const VIDEO_SAMPLE_DELTA = 1500;

const CONTAINER_BOXES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'udta', 'meta', 'ilst']);

function getBoxType(buffer, offset) {
  return buffer.toString('ascii', offset, offset + 4);
}

function setBoxType(buffer, offset, type) {
  for (let i = 0; i < 4; i += 1) {
    buffer[offset + i] = type.charCodeAt(i);
  }
}

function assertUint32(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`${label} out of bounds.`);
  }
}

function readBox(buffer, offset, end, parentPath = '') {
  if (offset + 8 > end) { throw new Error('Invalid MP4: incomplete box.'); }
  const smallSize = buffer.readUInt32BE(offset);
  const type = getBoxType(buffer, offset + 4);
  let size = smallSize; 
  let headerSize = 8;
  
  if (smallSize === 1) {
    if (offset + 16 > end) { throw new Error(`Invalid MP4 box.`); }
    const high = buffer.readUInt32BE(offset + 8); 
    const low = buffer.readUInt32BE(offset + 12);
    size = high * 4294967296 + low; 
    headerSize = 16;
  } else if (smallSize === 0) { 
    size = end - offset; 
  }
  
  return { 
    type, offset, size, headerSize, 
    contentStart: offset + headerSize, 
    end: offset + size, 
    path: parentPath ? `${parentPath}/${type}` : type, 
    data: buffer, 
    children: [], 
    prefixStart: offset + headerSize, 
    prefixEnd: offset + headerSize 
  };
}

function childStartForBox(box) {
  if (box.type === 'meta') { return box.contentStart + 4; }
  return box.contentStart;
}

function parseBoxes(buffer, start = 0, end = buffer.length, parentPath = '') {
  const boxes = []; 
  let offset = start;
  while (offset + 8 <= end) {
    const box = readBox(buffer, offset, end, parentPath);
    if (CONTAINER_BOXES.has(box.type)) {
      const childStart = childStartForBox(box);
      box.prefixStart = box.contentStart; 
      box.prefixEnd = childStart;
      box.children = parseBoxes(buffer, childStart, box.end, box.path);
    }
    boxes.push(box); 
    offset = box.end;
  }
  return boxes;
}

function findChild(box, type) { return box.children.find((child) => child.type === type) || null; }
function findDescendant(box, path) {
  let current = box;
  for (const type of path) { current = findChild(current, type); if (!current) return null; }
  return current;
}
function findTopLevel(boxes, type) { return boxes.find((box) => box.type === type) || null; }

function handlerTypeForTrak(trak) {
  const hdlr = findDescendant(trak, ['mdia', 'hdlr']);
  if (!hdlr || hdlr.offset + 20 > hdlr.end) { return null; }
  return getBoxType(hdlr.data, hdlr.offset + 16);
}

function parseStsz(stsz) {
  const sampleSize = stsz.data.readUInt32BE(stsz.offset + 12);
  const count = stsz.data.readUInt32BE(stsz.offset + 16);
  if (sampleSize) { return new Array(count).fill(sampleSize); }
  const tableStart = stsz.offset + 20;
  const sizes = [];
  for (let i = 0; i < count; i += 1) { sizes.push(stsz.data.readUInt32BE(tableStart + i * 4)); }
  return sizes;
}

function parseStco(stco) {
  const count = stco.data.readUInt32BE(stco.offset + 12); 
  const tableStart = stco.offset + 16;
  const offsets = [];
  for (let i = 0; i < count; i += 1) { offsets.push(stco.data.readUInt32BE(tableStart + i * 4)); }
  return offsets;
}

function parseStsc(stsc) {
  const count = stsc.data.readUInt32BE(stsc.offset + 12); 
  const tableStart = stsc.offset + 16;
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const offset = tableStart + i * 12;
    rows.push([stsc.data.readUInt32BE(offset), stsc.data.readUInt32BE(offset + 4), stsc.data.readUInt32BE(offset + 8)]);
  }
  return rows;
}

function makeBox(type, payload) {
  const size = 8 + payload.length; 
  assertUint32(size, `${type}.size`);
  const box = Buffer.alloc(size); 
  box.writeUInt32BE(size, 0); 
  setBoxType(box, 4, type); 
  payload.copy(box, 8);
  return box;
}

function boxBytes(box) { return box.data.subarray(box.offset, box.end); }
function boxPayload(box) { return box.data.subarray(box.contentStart, box.end); }

function getOriginalDurationInfo(mdhdBox) {
  const payload = boxPayload(mdhdBox);
  const version = payload[0];
  let timescale, duration;
  if (version === 1) {
    timescale = payload.readUInt32BE(20);
    const high = payload.readUInt32BE(24);
    const low = payload.readUInt32BE(28);
    duration = high * 4294967296 + low;
  } else {
    timescale = payload.readUInt32BE(12);
    duration = payload.readUInt32BE(16);
  }
  return { timescale, duration };
}

function buildAdaptiveMdhd(box, computedDuration) {
  const payload = Buffer.from(boxPayload(box));
  payload.writeUInt32BE(VIDEO_TIMESCALE, 12); 
  payload.writeUInt32BE(computedDuration, 16);
  return makeBox('mdhd', payload);
}

function buildElst(box) {
  const payload = Buffer.from(boxPayload(box));
  payload.writeUInt32BE(VIDEO_EDIT_MEDIA_TIME, 12);
  return makeBox('elst', payload);
}

function buildStts(realSampleCount, fakeSampleCount) {
  const payload = Buffer.alloc(4 + 4 + 8 + 8);
  payload.writeUInt32BE(2, 4);
  payload.writeUInt32BE(realSampleCount, 8); 
  payload.writeUInt32BE(VIDEO_SAMPLE_DELTA, 12);
  payload.writeUInt32BE(fakeSampleCount, 16); 
  payload.writeUInt32BE(VIDEO_SAMPLE_DELTA, 20);
  return makeBox('stts', payload);
}

function buildStsz(originalSizes, fakeSampleCount) {
  const totalSamples = originalSizes.length + fakeSampleCount;
  const payload = Buffer.alloc(4 + 4 + 4 + totalSamples * 4);
  payload.writeUInt32BE(totalSamples, 8);
  let offset = 12;
  originalSizes.forEach((size) => { payload.writeUInt32BE(size, offset); offset += 4; });
  for (let i = 0; i < fakeSampleCount; i += 1) { payload.writeUInt32BE(FAKE_SAMPLE_SIZE, offset); offset += 4; }
  return makeBox('stsz', payload);
}

function buildStsc(originalRows, originalChunkCount) {
  const rows = originalRows.map((row) => [...row]); 
  const lastRow = rows[rows.length - 1];
  if (!lastRow || lastRow[1] !== 1) { rows.push([originalChunkCount + 1, 1, 1]); }
  const payload = Buffer.alloc(4 + 4 + rows.length * 12);
  payload.writeUInt32BE(rows.length, 4);
  let offset = 8;
  rows.forEach(([firstChunk, samplesPerChunk, sampleDescriptionIndex]) => {
    payload.writeUInt32BE(firstChunk, offset); 
    payload.writeUInt32BE(samplesPerChunk, offset + 4); 
    payload.writeUInt32BE(sampleDescriptionIndex, offset + 8); 
    offset += 12;
  });
  return makeBox('stsc', payload);
}

function buildStco(originalOffsets, delta, fakeOffset = null, fakeSampleCount = 0) {
  const count = originalOffsets.length + (fakeOffset === null ? 0 : fakeSampleCount);
  const payload = Buffer.alloc(4 + 4 + count * 4);
  payload.writeUInt32BE(count, 4);
  let tableOffset = 8;
  originalOffsets.forEach((offset) => {
    const shifted = offset + delta; 
    payload.writeUInt32BE(shifted, tableOffset); 
    tableOffset += 4;
  });
  if (fakeOffset !== null) {
    for (let i = 0; i < fakeSampleCount; i += 1) { payload.writeUInt32BE(fakeOffset, tableOffset); tableOffset += 4; }
  }
  return makeBox('stco', payload);
}

function rebuildBox(box, replacements) {
  if (replacements.has(box)) { return replacements.get(box); }
  if (!box.children.length) { return boxBytes(box); }
  const parts = [box.data.subarray(box.prefixStart, box.prefixEnd)];
  box.children.forEach((child) => { parts.push(rebuildBox(child, replacements)); });
  return makeBox(box.type, Buffer.concat(parts));
}

function collectTrackStcoBoxes(moov) {
  const stcoBoxes = [];
  moov.children.filter((child) => child.type === 'trak').forEach((trak) => {
    const stbl = findDescendant(trak, ['mdia', 'minf', 'stbl']); if (!stbl) return;
    const stco = findChild(stbl, 'stco'); if (stco) { stcoBoxes.push(stco); }
  });
  return stcoBoxes;
}

function buildStcoReplacements(stcoBoxes, videoStco, delta, fakeOffset, fakeSampleCount) {
  const replacements = new Map();
  stcoBoxes.forEach((stco) => {
    replacements.set(stco, buildStco(parseStco(stco), delta, stco === videoStco ? fakeOffset : null, fakeSampleCount));
  });
  return replacements;
}

async function patchSharkSampleTableMethod(fileBuffer) {
  const topLevel = parseBoxes(fileBuffer);
  const ftyp = findTopLevel(topLevel, 'ftyp'); 
  const moov = findTopLevel(topLevel, 'moov'); 
  const mdat = findTopLevel(topLevel, 'mdat');
  if (!ftyp || !moov || !mdat) { throw new Error('Missing primary structural atoms.'); }
  
  const videoTrak = moov.children.find((child) => child.type === 'trak' && handlerTypeForTrak(child) === 'vide');
  if (!videoTrak) { throw new Error('Target video track layer missing.'); }

  const stbl = findDescendant(videoTrak, ['mdia', 'minf', 'stbl']);
  const mdhd = findDescendant(videoTrak, ['mdia', 'mdhd']);
  const elst = findDescendant(videoTrak, ['edts', 'elst']);
  const stts = stbl && findChild(stbl, 'stts'); 
  const stsc = stbl && findChild(stbl, 'stsc');
  const stsz = stbl && findChild(stbl, 'stsz'); 
  const stco = stbl && findChild(stbl, 'stco');
  if (!stbl || !mdhd || !elst || !stts || !stsc || !stsz || !stco) { throw new Error('Missing target stream atoms.'); }

  // 1. DYNAMIC DURATION COMPUTATION BASED ON INPUT METADATA
  const origMeta = getOriginalDurationInfo(mdhd);
  const videoSeconds = origMeta.duration / origMeta.timescale;
  
  // Scales up gracefully only if video length extends past 25.21s boundary limit
  const targetDuration = Math.max(2269500, Math.ceil(videoSeconds * VIDEO_TIMESCALE));

  const originalSizes = parseStsz(stsz); 
  const realSampleCount = originalSizes.length; 
  
  // 2. ADAPTIVE FAKE SAMPLE CAPACITY COMPUTATION
  const fakeSampleCount = Math.max(realSampleCount * 9, Math.floor(targetDuration / VIDEO_SAMPLE_DELTA));

  const originalStscRows = parseStsc(stsc); 
  const originalChunkOffsets = parseStco(stco); 
  const stcoBoxes = collectTrackStcoBoxes(moov);
  const preservedTopLevel = topLevel.filter((box) => !['ftyp', 'moov', 'mdat'].includes(box.type)).map(boxBytes);

  const fixedReplacements = new Map([
    [mdhd, buildAdaptiveMdhd(mdhd, targetDuration)], 
    [elst, buildElst(elst)], 
    [stts, buildStts(realSampleCount, fakeSampleCount)], 
    [stsc, buildStsc(originalStscRows, originalChunkOffsets.length)], 
    [stsz, buildStsz(originalSizes, fakeSampleCount)]
  ]);
  
  const placeholderReplacements = new Map(fixedReplacements);
  buildStcoReplacements(stcoBoxes, stco, 0, 0, fakeSampleCount).forEach((value, key) => { placeholderReplacements.set(key, value); });

  const moovPlaceholder = rebuildBox(moov, placeholderReplacements); 
  const preservedBytes = Buffer.concat(preservedTopLevel);
  const oldMdatPayloadStart = mdat.contentStart; 
  const oldMdatPayload = fileBuffer.subarray(mdat.contentStart, mdat.end);
  const newMdatPayloadStart = ftyp.size + moovPlaceholder.length + preservedBytes.length + 8;
  
  let delta = newMdatPayloadStart - oldMdatPayloadStart; 
  let fakeOffset = newMdatPayloadStart + oldMdatPayload.length;

  let finalReplacements = new Map(fixedReplacements);
  buildStcoReplacements(stcoBoxes, stco, delta, fakeOffset, fakeSampleCount).forEach((value, key) => { finalReplacements.set(key, value); });
  
  let moovNew = rebuildBox(moov, finalReplacements);
  const recalculatedMdatPayloadStart = ftyp.size + moovNew.length + preservedBytes.length + 8;
  delta = recalculatedMdatPayloadStart - oldMdatPayloadStart; 
  fakeOffset = recalculatedMdatPayloadStart + oldMdatPayload.length;

  finalReplacements = new Map(fixedReplacements);
  buildStcoReplacements(stcoBoxes, stco, delta, fakeOffset, fakeSampleCount).forEach((value, key) => { finalReplacements.set(key, value); });
  moovNew = rebuildBox(moov, finalReplacements);
  
  const mdatPayloadNew = Buffer.concat([oldMdatPayload, FAKE_SAMPLE_BYTES]);
  const mdatNew = makeBox('mdat', mdatPayloadNew);
  
  const output = Buffer.concat([boxBytes(ftyp), moovNew, preservedBytes, mdatNew]);
  
  return {
    output: output,
    realSamples: realSampleCount,
    fakeSamples: fakeSampleCount
  };
}

module.exports = { patchSharkSampleTableMethod };
