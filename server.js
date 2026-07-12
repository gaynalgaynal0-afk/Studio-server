const express = require('express');
const multer = require('multer');
const cors = require('cors');

const app = express();
app.use(cors());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 } // 30MB
});

const API_KEY = "JOY_API_KEY";

app.use((req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) {
    return res.status(403).send('Unauthorized');
  }
  next();
});

const { patchSharkSampleTableMethod } = require('./patcher');

app.post('/patch', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded');
    }

    const inputBuffer = req.file.buffer;

    // ⚡ Await the object wrapper return
    const result = await patchSharkSampleTableMethod(inputBuffer);

    if (!result || !result.output) {
      return res.status(500).send('Invalid patch result');
    }

    // 🎯 Safely isolate the raw binary stream data payload
    const outputBuffer = Buffer.from(result.output);

    res.set({
      'Content-Type': 'video/mp4',
      'Content-Disposition': 'attachment; filename="patched.mp4"',
      'Content-Length': outputBuffer.length
    });

    res.send(outputBuffer);

  } catch (err) {
    console.error("PATCH ERROR:", err);
    res.status(500).send('Patch failed');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
