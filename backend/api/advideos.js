const express = require("express");
const multer = require("multer");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");

const router = express.Router();
const ROOT = path.resolve(__dirname, "..");

const STREAMS_DIR = path.join(ROOT, "storage", "public_videos");
const DB_FILE = path.join(ROOT, "data", "advideos.json");

if (!fs.existsSync(STREAMS_DIR)) fs.mkdirSync(STREAMS_DIR, { recursive: true });
if (!fs.existsSync(path.dirname(DB_FILE)))
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const upload = multer({ dest: os.tmpdir() });

// --- UPDATED ROUTE ---
router.post("/upload", upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "NO_FILE" });

  // 1. Capture additional data
  const videoId = crypto.randomUUID();
  const userId = req.body.userId || "anonymous"; // Assumes req.user is set by your auth middleware
  const caption = req.body.caption || ""; // Extracted from form-data body

  const outDir = path.join(STREAMS_DIR, videoId);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const inputPath = `"${path.resolve(req.file.path)}"`;
  const playlistPath = `"${path.join(outDir, "index.m3u8")}"`;
  const segmentPattern = `"${path.join(outDir, "seg_%03d.ts")}"`;

  res.status(202).json({
    message: "Processing started",
    videoId,
    status: "processing",
  });

  const args = [
    "-y",
    "-i",
    inputPath,
    "-t",
    "120",
    "-vf",
    "scale='trunc(iw/2)*2:trunc(ih/2)*2'",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-ac",
    "2",
    "-f",
    "hls",
    "-hls_time",
    "6",
    "-hls_playlist_type",
    "vod",
    "-hls_flags",
    "independent_segments",
    "-hls_segment_filename",
    segmentPattern,
    playlistPath,
  ];

  const worker = spawn("ffmpeg", args, {
    shell: true,
    windowsVerbatimArguments: true,
  });

  worker.on("close", (code) => {
    const rawInput = req.file.path;
    if (code === 0) {
      // 2. Pass userId and caption to the database helper
      updateDatabase(videoId, "READY", userId, caption);
    } else {
      updateDatabase(videoId, "FAILED", userId, caption);
    }

    if (fs.existsSync(rawInput)) {
      fs.unlinkSync(rawInput);
    }
  });
});

// --- UPDATED DATABASE HELPER ---
function updateDatabase(id, status, userId, caption) {
  try {
    const data = fs.existsSync(DB_FILE)
      ? JSON.parse(fs.readFileSync(DB_FILE, "utf-8"))
      : [];

    data.push({
      id,
      userId, // Added
      caption, // Added
      status,
      updatedAt: new Date().toISOString(),
    });

    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("DB Update Error:", err.message);
  }
}

module.exports = router;
