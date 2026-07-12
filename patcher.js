function patchSharkSampleTableMethod(buffer) {
  return {
    output: Buffer.from(buffer)
  };
}

module.exports = {
  patchSharkSampleTableMethod
};
