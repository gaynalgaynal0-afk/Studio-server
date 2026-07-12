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

// 🔐 FIX #1: Move API key to environment variable
const API_KEY = process.env.API_KEY || process.env.JOY_API_KEY;

if (!API_KEY) {
  console.warn('⚠️ WARNING: API_KEY environment variable not set. Using default (insecure).');
  console.warn('Set API_KEY environment variable before deploying to production.');
}

// Authentication middleware
app.use((req, res, next) => {
  // Skip auth for health check
  if (req.path === '/') {
    return next();
  }
  
  const key = req.headers['x-api-key'];
  if (!key || key !== (API_KEY || 'default-key')) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
});

// 📦 Load patcher
const { patchSharkSampleTableMethod: patchVideo } = require('./patcher');

// FIX #2: Add rate limiting for abuse prevention
const rateLimit = {};
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 50; // requests per window

function checkRateLimit(ip) {
  const now = Date.now();
  
  if (!rateLimit[ip]) {
    rateLimit[ip] = { count: 1, reset: now + RATE_LIMIT_WINDOW };
    return true;
  }
  
  const entry = rateLimit[ip];
  if (now > entry.reset) {
    entry.count = 1;
    entry.reset = now + RATE_LIMIT_WINDOW;
    return true;
  }
  
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return false;
  }
  return true;
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const ip in rateLimit) {
    if (now > rateLimit[ip].reset) {
      delete rateLimit[ip];
    }
  }
}, 5 * 60 * 1000); // Every 5 minutes

// 🚀 MAIN ROUTE
app.post('/patch', (req, res) => {
  // FIX #3: Apply rate limiting
  const clientIp = req.ip || req.connection.remoteAddress;
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ 
      error: 'Rate limit exceeded. Max 50 requests per 15 minutes.' 
    });
  }

  // FIX #4: Handle file upload with better error handling
  upload.single('video')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Max 30MB.' });
      }
      return res.status(400).json({ error: 'Upload error: ' + err.message });
    } else if (err) {
      return res.status(500).json({ error: 'Unexpected error' });
    }

    // Continue with patching
    patchRequest(req, res);
  });
});

async function patchRequest(req, res) {
  try {
    // FIX #5: Validate file was actually uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const inputBuffer = req.file.buffer;
    const originalName = req.file.originalname || 'video.mp4';

    // FIX #6: Validate file is actually MP4 format
    if (!originalName.toLowerCase().endsWith('.mp4')) {
      return res.status(400).json({ 
        error: 'Only .mp4 files are supported. Got: ' + originalName 
      });
    }

    // Quick magic number check for MP4
    if (inputBuffer.length < 8 || inputBuffer.toString('latin1', 4, 8) !== 'ftyp') {
      return res.status(400).json({ 
        error: 'File does not appear to be a valid MP4' 
      });
    }

    console.log(`[PATCH] Processing: ${originalName} (${(inputBuffer.length / 1024 / 1024).toFixed(2)}MB)`);

    // ⚡ Run patcher (synchronous, no await needed)
    const result = patchVideo(inputBuffer);

    // FIX #7: Validate patch result
    if (!result || !result.output || !Buffer.isBuffer(result.output)) {
      console.error('[ERROR] Invalid patch result');
      return res.status(500).json({ error: 'Patch produced invalid output' });
    }

    if (result.output.length === 0) {
      console.error('[ERROR] Patch output is empty');
      return res.status(500).json({ error: 'Patch produced empty output' });
    }

    console.log(`[PATCH] Success: ${(result.output.length / 1024 / 1024).toFixed(2)}MB output`);
    if (result.stats) {
      console.log(`[PATCH] Stats:`, result.stats);
    }

    // 🎯 Send back video
    const outputName = originalName.replace(/\.mp4$/i, '_patched.mp4');
    res.set({
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${outputName}"`,
      'Content-Length': result.output.length,
      'X-Patch-Success': 'true'
    });

    res.send(result.output);

  } catch (err) {
    console.error("[PATCH ERROR]", err.message);
    
    // FIX #8: Return detailed error info
    const statusCode = err.message.includes('exceeds') ? 413 : 400;
    res.status(statusCode).json({
      error: err.message,
      type: err.constructor.name
    });
  }
}

// ⚠️ Error handler for multer size limit
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Maximum 30MB allowed.' });
  }
  
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ❤️ Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'Video Patcher API',
    version: '1.1.0'
  });
});

// FIX #9: Add endpoint info
app.get('/info', (req, res) => {
  res.json({
    name: 'JV Studio Video Patcher',
    version: '1.1.0',
    description: 'MP4 patcher for TikTok compatibility',
    endpoints: {
      POST: '/patch - Upload video to patch (requires X-API-Key header)',
      GET: '/ - Health check',
      GET: '/info - This information'
    },
    limits: {
      maxFileSize: '30MB',
      rateLimit: '50 requests per 15 minutes'
    }
  });
});

// Graceful error handling for unhandled routes
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// FIX #10: Proper port handling
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Patcher Server v1.1.0 running on port ${PORT}`);
  console.log(`📍 POST /patch - Upload and patch videos`);
  console.log(`🔐 Authentication: X-API-Key header required`);
  console.log(`⚙️  Max file size: 30MB`);
  console.log(`📊 Rate limit: 50 requests per 15 minutes\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('\n❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
