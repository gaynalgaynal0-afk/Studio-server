const fs = require("fs");

async function runV5JsPatcher({
  inputPath,
  outputPath,
  compatibilityMode = "safe"
}) {
  try {
    const buffer = fs.readFileSync(inputPath);
    const output = Buffer.from(buffer);

    // 🔹 Find MP4 header (ftyp)
    const ftypIndex = output.indexOf("ftyp");

    if (ftypIndex !== -1) {
      const versionIndex = ftypIndex + 8;

      if (versionIndex < output.length) {
        // small safe modification
        output[versionIndex] =
          (output[versionIndex] + 1) % 255;
      }
    }

    // 🔹 Optional safe marker (won’t break video)
    if (compatibilityMode === "safe") {
      const freeIndex = output.indexOf("free");

      if (freeIndex !== -1 && freeIndex + 12 < output.length) {
        output.write("PATCHED!", freeIndex + 4, "ascii");
      }
    }

    fs.writeFileSync(outputPath, output);

    return true;
  } catch (err) {
    console.error("Patch error:", err);

    // fallback (copy original)
    fs.copyFileSync(inputPath, outputPath);
    return false;
  }
}

module.exports = {
  runV5JsPatcher
};
