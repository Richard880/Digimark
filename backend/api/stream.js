// api/stream/token.js
const express = require("express");
const streamToken = require("../utils/streamToken");
const wallets = require("../data/wallets");
const videosDb = require("../data/videos");

const router = express.Router();

// TEMP auth (replace later)
// api/stream.js (Backend)
function auth(req, res, next) {
  // Read the header we just sent from the frontend
  const userId = req.headers["x-user-id"]; 
  
  if (!userId) {
    return res.status(401).json({ error: "USER_ID_MISSING" });
  }
  
  req.user = { id: userId };
  next();
}


/**
 * GET /api/stream/token?videoId=xxx
 * Header: x-user-id (optional later)
 */
router.get("/token", auth, (req, res) => {
  const userId = req.user?.id;
  const videoId = req.query.videoId;

  if (!userId) {
    return res.status(401).json({ error: "UNAUTHENTICATED" });
  }

  if (!videoId) {
    return res.status(400).json({ error: "NO_VIDEO_ID" });
  }

  const video = videosDb.getById(videoId);
  if (!video || video.status !== "READY") {
    return res.status(404).json({ error: "VIDEO_NOT_READY" });
  }

  const wallet = wallets.getWallet(userId);
  if (!wallet || !wallets.hasActiveFloat(wallet)) {
    return res.status(402).json({ error: "FLOAT_REQUIRED" });
  }

  // short-lived token (e.g. 60s)
  const token = streamToken.sign({
    userId,
    videoId,
    scope: "full",
  });

  return res.json({
    token,
    expiresIn: streamToken.DEFAULT_TTL,
  });
});

module.exports = router;
