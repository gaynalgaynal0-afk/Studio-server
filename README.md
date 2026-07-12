# JV-60FPS Video Patcher Server

Express server for MP4 timestamp patching (mvhd/mdhd) via HTTP.

## Local setup

```bash
npm install
node server.js
```

Server runs on port 3000 (or `$PORT`).

## Deploy on Render

1. Create new Web Service on render.com
2. Connect your GitHub repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add environment variable: `API_KEY=your_secure_key`
6. Deploy

## API

**POST** `/patch`
- Header: `x-api-key: <your_api_key>`
- Body: multipart/form-data with `video` file (max 30MB)
- Response: patched MP4 video (same size ±a few KB)

Example with curl:
```bash
curl -X POST https://your-render-url.onrender.com/patch \
  -H "x-api-key: your_secure_key" \
  -F "video=@input.mp4" \
  -o output.mp4
```

## What it does

Patches MP4 container metadata (mvhd/mdhd boxes):
- Normalizes timescale to 90000 Hz (standard for video)
- Adjusts duration to match real playback time
- Preserves all video/audio data (no re-encoding)

Safe, legitimate quality-preservation technique.
