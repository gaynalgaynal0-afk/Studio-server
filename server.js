const express = require('express');
const multer = require('multer');
const cors = require('cors');

const app = express();

// ✅ Enable CORS (for extension requests)
app.use(cors());

// 🔒 Memory upload configuration (NO disk storage to maintain server speed)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 } // 30MB limit
});

// 🔐 Optional API key protection
const API_KEY = "JOY_API_KEY";

app.use((req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) {
    return res.status(403).send('Unauthorized');
  }
  next();
});

// 📦 Load your adaptive custom patcher
const { patchSharkSampleTableMethod } = require('./patcher');

// 🚀 MAIN PATCH ROUTE
app.post('/patch', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded');
    }

    const inputBuffer = req.file.buffer;

    // ⚡ Run your adaptive patcher logic
    const result = await patchSharkSampleTableMethod(inputBuffer);

    if (!result || !result.output) {
      return res.status(500).send('Invalid patch result');
    }

    // 🎯 Set headers to deliver the patched video streaming buffer back directly
    res.set({
      'Content-Type': 'video/mp4',
      'Content-Disposition': 'attachment; filename="patched.mp4"',
      'Content-Length': result.output.length
    });

    // Ensure the output is converted explicitly into a Node Buffer object
    res.send(Buffer.from(result.output));

  } catch (err) {
    console.error("PATCH ERROR:", err);
    res.status(500).send(`Patch failed: ${err.message}`);
  }
});

// ⚠️ File size threshold handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).send('File too large. Maximum size allowed is 30MB.');
  }
  next(err);
});

// 🌐 Start Backend Express Engine
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Shark Patcher server running on port ${PORT}`);
});
