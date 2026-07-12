const express = require('express');
const multer = require('multer');
const cors = require('cors');

const app = express();

// ✅ Enable CORS
app.use(cors());

// 🔒 Memory upload configuration (30MB Limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 } 
});

// 🔐 API key protection
const API_KEY = "JOY_API_KEY";

app.use((req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) {
    return res.status(403).send('Unauthorized');
  }
  next();
});

// 📦 Load the patcher
const { patchSharkSampleTableMethod } = require('./patcher');

// 🚀 MAIN PATCH ROUTE
app.post('/patch', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded');
    }

    const inputBuffer = req.file.buffer;

    // ⚡ Run the patcher
    const result = await patchSharkSampleTableMethod(inputBuffer);

    if (!result || !result.output) {
      return res.status(500).send('Invalid patch result');
    }

    // 🎯 Extract the raw output buffer directly
    const finalBuffer = result.output;

    // 🏷️ Set exact headers
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Disposition': 'attachment; filename="patched.mp4"',
      'Content-Length': finalBuffer.length
    });

    // 🚀 Stream the video buffer cleanly without Express conversions
    res.write(finalBuffer);
    res.end();

  } catch (err) {
    console.error("PATCH ERROR:", err);
    if (!res.headersSent) {
      res.status(500).send('Patch failed');
    }
  }
});

// ⚠️ Error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).send('File too large.');
  }
  next(err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
