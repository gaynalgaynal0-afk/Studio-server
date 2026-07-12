const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const { runV5JsPatcher } = require("./patcher");

const app = express();
const upload = multer({ dest: "uploads/" });

// 🔥 Upload endpoint
app.post("/upload", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }

    const inputPath = req.file.path;
    const outputPath = path.join(
      "uploads",
      "patched_" + Date.now() + ".mp4"
    );

    // ✅ Run patcher ONLY (no FFmpeg)
    await runV5JsPatcher({
      inputPath,
      outputPath,
      compatibilityMode: "safe"
    });

    // ✅ Send file back
    res.download(outputPath, "patched.mp4", () => {
      try {
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
      } catch {}
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Patch failed");
  }
});

// root check
app.get("/", (req, res) => {
  res.send("Video patcher is running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("Server running on port " + PORT)
);
