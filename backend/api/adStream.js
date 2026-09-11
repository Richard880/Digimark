const express = require("express");
const path = require("path");

const router = express.Router();

// Root directory of your project
const ROOT = path.resolve(__dirname, "..");

// Get the absolute path to your storage folder
// Use process.cwd() to ensure it starts from your project root
const storagePath = path.join(process.cwd(), "storage", "public_videos");

console.log("HLS Server is looking in:", storagePath);

router.use(
  "/public",
  express.static(storagePath, {
    setHeaders: (res, filePath) => {
      res.set("Access-Control-Allow-Origin", "*");
      // Ensure HLS MIME types are explicitly set
      if (filePath.endsWith(".m3u8")) {
        res.set("Content-Type", "application/vnd.apple.mpegurl");
      }
      if (filePath.endsWith(".ts")) {
        res.set("Content-Type", "video/mp2t");
      }
    },
  })
);

module.exports = router;

module.exports = router;
