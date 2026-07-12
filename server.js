const express = require('express');
const multer = require('multer');
const cors = require('cors');

const app = express();

// ✅ Enable CORS (for extension requests)
app.use(cors());

// 🔒 Memory upload (NO disk storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 } // 30MB
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

// 📦 Load patcher
const { patchVideo } = require('./patcher');

// 🚀 MAIN ROUTE
app.post('/patch', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded');
    }

    const inputBuffer = req.file.buffer;

    // ⚡ Run patcher (mvhd/mdhd timestamp patch)
    const result = await patchVideo(inputBuffer);

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
