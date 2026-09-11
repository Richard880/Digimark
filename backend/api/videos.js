const express = require("express");
const multer = require("multer");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const videosDb = require("../data/videos");
const verifyStreamSegment = require("../middleware/verifyStreamSegment");
const Engine = require("../Search/engine");
const messaging = require("./messaging"); // Ensure getIo is exported here

const router = express.Router();

/* ============================
   Upload configuration
============================ */
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      // Use the OS's official temp directory to avoid permission issues
      const tempDir = os.tmpdir();
      console.log(`💾 Saving temp file to: ${tempDir}`);
      cb(null, tempDir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
});

router.use((req, res, next) => {
  console.log(`📡 Incoming request to /api/videos: ${req.method} ${req.url}`);
  next();
});

/* ============================
   POST /api/videos
============================ */
router.post(
  "/",
  (req, res, next) => {
    upload.single("video")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        console.error("❗ Multer Error:", err.message);
        return res
          .status(500)
          .json({ error: "MULTER_ERROR", details: err.message });
      } else if (err) {
        console.error("❗ Unknown Upload Error:", err.message);
        return res
          .status(500)
          .json({ error: "UNKNOWN_UPLOAD_ERROR", details: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    let responseSent = false;
    let videoIdForCleanup = null;

    const sendResponse = (status, data) => {
      if (responseSent) return;
      responseSent = true;
      return res.status(status).json(data);
    };

    try {
      if (!req.file) {
        console.error("❌ req.file is missing after Multer finished.");
        return sendResponse(400, { error: "NO_FILE" });
      }

      console.log("✅ Upload received:", req.file.path);
      const inputPath = req.file.path;

      // Initialize video record in database
      const video = videosDb.create({
        title: req.body.title || req.file.originalname,
        userId: req.body.userId || "anonymous",
        tags: req.body.tags
          ? req.body.tags.split(",").map((t) => t.trim().toLowerCase())
          : [],
        status: "PROCESSING",
        createdAt: new Date().toISOString(),
      });

      videoIdForCleanup = video.id;

      // 1. Send the 202 Accepted response to the client immediately
      sendResponse(202, {
        message: "upload accepted, processing started",
        videoId: video.id,
      });

      /**
       * 2. Background Processing
       * We pass req.io (attached from server.js middleware) to the
       * processing function so it can emit FFmpeg progress via sockets.
       */
      processVideoAsync(inputPath, video.id, req.file.path, req.io)
        .then(() => {
          console.log(`✅ Video ${video.id} processing complete.`);
        })
        .catch((err) => {
          console.error(`🔥 Video ${video.id} processing FAILED:`, err);
          videosDb.updateStatus(video.id, "FAILED");

          // Optional: Notify client of failure via socket
          if (req.io) {
            req.io.emit("ffmpeg-error", {
              videoId: video.id,
              error: err.message,
            });
          }
        });
    } catch (err) {
      console.error("🔥 CRITICAL UPLOAD FAILED:", err);
      if (videoIdForCleanup) {
        videosDb.updateStatus(videoIdForCleanup, "FAILED");
      }
      return sendResponse(500, { error: err.message });
    }
  },
);
/* ============================
   Helper: Get Video Duration
============================ */
function getVideoDuration(inputPath) {
  try {
    const probe = spawnSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ]);
    return parseFloat(probe.stdout.toString().trim()) || 0;
  } catch (e) {
    console.error("❌ Failed to probe duration:", e.message);
    return 0;
  }
}

/* ============================
   Helper: FFmpeg Runner with Progress
============================ */
const runFFmpeg = (args, label, socket, videoId, totalDuration) =>
  new Promise((resolve, reject) => {
    console.log(`▶ Starting FFmpeg: ${label} for ${videoId}`);
    const ff = spawn("ffmpeg", args);

    ff.stderr.on("data", (data) => {
      const text = data.toString();
      // Regex to find "time=00:00:00.00"
      const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);

      if (timeMatch && totalDuration > 0 && socket) {
        const hours = parseInt(timeMatch[1]);
        const mins = parseInt(timeMatch[2]);
        const secs = parseInt(timeMatch[3]);
        const currentSeconds = hours * 3600 + mins * 60 + secs;

        const percent = Math.min(
          99,
          Math.round((currentSeconds / totalDuration) * 100),
        );

        // Send to frontend via Socket.IO
        socket.emit("ffmpeg-progress", {
          videoId,
          percent,
          step: label,
        });
      }
    });

    ff.on("error", (err) => reject(err));

    ff.on("close", (code) => {
      code === 0
        ? resolve()
        : reject(new Error(`FFmpeg ${label} failed: ${code}`));
    });
  });

/* ============================
   Async video processing
============================ */
async function processVideoAsync(inputPath, videoId, tempFilePath, io) {
  const BASE_DIR = path.join(__dirname, "../storage/videos", videoId);
  const PREVIEW_DIR = path.join(BASE_DIR, "preview");
  const FULL_DIR = path.join(BASE_DIR, "full");

  console.log(`🎬 Starting async processing for video ${videoId}`);

  try {
    // 1. Setup Directories
    if (!fs.existsSync(PREVIEW_DIR))
      fs.mkdirSync(PREVIEW_DIR, { recursive: true });
    if (!fs.existsSync(FULL_DIR)) fs.mkdirSync(FULL_DIR, { recursive: true });

    // 2. Get Metadata
    const totalDuration = getVideoDuration(inputPath);
    console.log(`🎬 Video Duration: ${totalDuration}s`);

    // 3. Generate Thumbnail
    await runFFmpeg(
      [
        "-y",
        "-i",
        inputPath,
        "-ss",
        "00:00:02",
        "-vframes",
        "1",
        "-q:v",
        "2",
        "-s",
        "480x270",
        path.join(BASE_DIR, "thumb.jpg"),
      ],
      "THUMBNAIL",
      io,
      videoId,
      totalDuration,
    );

    // 4. Generate Preview (HLS)
    await runFFmpeg(
      [
        "-y",
        "-i",
        inputPath,
        "-t",
        "30",
        "-vf",
        "scale=640:360:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-f",
        "hls",
        "-hls_time",
        "4",
        "-hls_playlist_type",
        "vod",
        "-hls_segment_filename",
        path.join(PREVIEW_DIR, "seg_%03d.ts"),
        path.join(PREVIEW_DIR, "master.m3u8"),
      ],
      "PREVIEW",
      io,
      videoId,
      totalDuration,
    );

    // 5. Generate Full Multi-Bitrate HLS
    await runFFmpeg(
      [
        "-y",
        "-i",
        inputPath,
        "-filter_complex",
        "[0:v]split=3[v1][v2][v3];[v1]scale=1280:-2[v1o];[v2]scale=854:-2[v2o];[v3]scale=640:-2[v3o]",
        "-map",
        "[v1o]",
        "-map",
        "0:a?",
        "-ac",
        "2",
        "-map",
        "[v2o]",
        "-map",
        "0:a?",
        "-ac",
        "2",
        "-map",
        "[v3o]",
        "-map",
        "0:a?",
        "-ac",
        "2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-f",
        "hls",
        "-hls_time",
        "4",
        "-hls_playlist_type",
        "vod",
        "-hls_flags",
        "independent_segments",
        "-hls_segment_filename",
        path.join(FULL_DIR, "seg_%v_%03d.ts"),
        "-master_pl_name",
        "master.m3u8",
        "-var_stream_map",
        "v:0,a:0 v:1,a:1 v:2,a:2",
        path.join(FULL_DIR, "stream_%v.m3u8"),
      ],
      "FULL",
      io,
      videoId,
      totalDuration,
    );

    // 6. Finalize
    if (io) {
      io.emit("ffmpeg-done", { videoId });
    }

    // Update DB to READY
    videosDb.updateStatus(videoId, "READY", {
      previewKey: `${videoId}/preview/master.m3u8`,
      storageKey: `${videoId}/full/master.m3u8`,
      thumbnail: `storage/videos/${videoId}/thumb.jpg`,
    });

    console.log(`✅ Video ${videoId} is READY`);

    // 4. Sync to Search Engine
    const finalVideo = videosDb.getById(videoId);
    if (typeof Engine !== "undefined") {
      Engine.add({ ...finalVideo, type: "video" }, "video");
    }

    // 5. Global Notification
    // FIX: Don't redefine 'const io' here. Use the one passed into processVideoAsync.
    if (io) {
      io.emit("NEW_CONTENT", {
        message: `🎥 New Release: ${finalVideo.title}`,
        thumbnail: finalVideo.thumbnail,
        type: "video",
      });
    }
  } catch (err) {
    console.error(`🔥 Processing Failed for ${videoId}:`, err);
    videosDb.updateStatus(videoId, "FAILED");
    if (io) io.emit("ffmpeg-error", { videoId, error: err.message });
  } finally {
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
  }
}

// 3. Update Database

/* ======================================================
   🎥 HLS File Server (single master, preview gated)
*/
function serveHls(scope) {
  return (req, res) => {
    const videoId = req.params.id;

    // Extract the wildcard and REMOVE the leading slash
    let subPath = req.params[0] || "";
    if (subPath.startsWith("/")) {
      subPath = subPath.substring(1);
    }

    const filePath = path.join(
      process.cwd(),
      "storage",
      "videos",
      videoId,
      scope,
      subPath,
    );

    // Now this check will pass if the filename matches what's on disk
    if (!fs.existsSync(filePath)) {
      console.error(`❌ NOT FOUND AT: ${filePath}`);
      return res.sendStatus(404);
    }
    // ... rest of code

    // 3. Now it's safe to log or check DB
    console.log(`Serving HLS from: ${filePath}`);

    const video = videosDb.getById(req.params.id);
    if (!video || video.status !== "READY") {
      console.error(`Video not found or not ready: ${req.params.id}`);
      return res.sendStatus(404);
    }

    // Set correct HLS Mime Types
    if (subPath.endsWith(".m3u8"))
      res.set("Content-Type", "application/vnd.apple.mpegurl");
    if (subPath.endsWith(".ts")) res.set("Content-Type", "video/MP2T");

    res.sendFile(
      filePath,
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        },
      },
      (err) => {
        if (err && !res.headersSent) {
          // Now filePath is definitely initialized here
          console.error(`HLS SendFile Error for: ${filePath}`, err.message);
          res.sendStatus(404);
        }
      },
    );
  };
}
/* ======================================================
   📂 ROUTES (Upgraded for modern path-to-regexp syntax)
====================================================== */
// This handles GET http://localhost:3000/api/videos
router.get("/", (req, res) => {
  try {
    const allVideos = videosDb.getAll();
    res.json(allVideos || []); // Always return an array, even if empty
  } catch (err) {
    res.status(500).json({ error: "Failed to load videos" });
  }
});

router.get("/:id", (req, res) => {
  const video = videosDb.getById(req.params.id);
  res.status(video ? 200 : 404).json(video || { error: "Not found" });
});

// GET /api/videos/user/:userId
router.get("/user/:userId", (req, res) => {
  const userId = req.params.userId;
  const userVideos = videosDb.getByUserId(userId);

  res.json({
    count: userVideos.length,
    videos: userVideos,
  });
});

// 🟢 FIX: Name the wildcard segment so the compiler boots without crashing
router.get("/:id/preview/*any", serveHls("preview"));
router.get("/:id/full/*any", verifyStreamSegment, serveHls("full"));

module.exports = router;
