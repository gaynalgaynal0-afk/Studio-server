const express = require("express");
const multer = require("multer");
const { patchSharkSampleTableMethod } = require("./patcher");

const app = express();

// Use memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  }
});

// Root route
app.get("/", (req, res) => {
  res.send("Server is running");
});

// Upload route (STREAM FIX)
app.post("/upload", upload.single("video"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }

    const inputBuffer = req.file.buffer;

    const { output } = patchSharkSampleTableMethod(inputBuffer);

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Length", output.length);

    // ✅ STREAMING (prevents 16KB bug)
    const chunkSize = 64 * 1024; // 64KB
    let offset = 0;

    function sendChunk() {
      if (offset >= output.length) {
        return res.end();
      }

      const end = Math.min(offset + chunkSize, output.length);
      const chunk = output.slice(offset, end);

      res.write(chunk);
      offset = end;

      setImmediate(sendChunk);
    }

    sendChunk();

  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).send("Processing error");
  }
});

// Start server
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
