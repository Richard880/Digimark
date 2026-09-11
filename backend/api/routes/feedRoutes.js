const express = require("express");
const router = express.Router();
const feedController = require("../../controllers/feedController");

// Call this when a user clicks a video to see "Up Next" or "Related"
router.get("/recommendations/:videoId", feedController.getSuggestedVideos);

// routes/feedRoutes.js
const feedService = require("../../services/feedService");

router.get("/ads", async (req, res) => {
  const ads = await feedService.generateAdFeed();
  res.json({ success: true, data: ads });
});

module.exports = router;
