const express = require("express");
const multer = require("multer");
const { patchSharkSampleTableMethod } = require("./patcher");

const app = express();

// Memory storage (no temp files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024
  }
});

// Root route
app.get("/", (req, res) => {
  res.send("Server is running");
});

// Upload route
app.post("/upload", upload.single("video"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }

    const inputBuffer = req.file.buffer;

    const { output } = patchSharkSampleTableMethod(inputBuffer);

    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": output.length
    });

    res.end(output);

  } catch (err) {
    console.error(err);
    res.status(500).send("Processing error");
  }
});

// Start server
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
