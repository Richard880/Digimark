const FeedService = require("../services/feedService");

exports.getSuggestedVideos = (req, res) => {
  try {
    const { videoId } = req.params;
    const recommendations = FeedService.getRecommendations(videoId);
    res.json({ success: true, data: recommendations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
