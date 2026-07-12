const express = require("express");
const multer = require("multer");

const app = express();

// memory only (no temp files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024
  }
});

// ROOT ROUTE (IMPORTANT)
app.get("/", (req, res) => {
  res.status(200).send("Server is running");
});

// UPLOAD ROUTE
app.post("/upload", upload.single("video"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }

    const buffer = req.file.buffer;

    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": buffer.length
    });

    return res.end(buffer);

  } catch (err) {
    console.error(err);
    res.status(500).send("Processing error");
  }
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});    const inputBuffer = req.file.buffer;

    // ⚡ Run YOUR patcher
    const result = await patchSharkSampleTableMethod(inputBuffer);

    if (!result || !result.output) {
      return res.status(500).send('Invalid patch result');
    }

    // 🎯 Send back video (no saving)
    res.set({
      'Content-Type': 'video/mp4',
      'Content-Disposition': 'attachment; filename=patched.mp4'
    });

    res.send(Buffer.from(result.output));

  } catch (err) {
    console.error("PATCH ERROR:", err);
    res.status(500).send('Patch failed');
  }
});

// ⚠️ File too large handler
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).send('Max file size is 30MB');
  }
  next(err);
});

// ❤️ Health check (Render needs this)
app.get('/', (req, res) => {
  res.send('Server is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
