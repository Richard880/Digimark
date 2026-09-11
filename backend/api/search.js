const express = require("express");
const router = express.Router();
const Engine = require("../Search/engine");

/**
 * GET /api/search?q=query
 * Returns a flat array of video and user objects.
 */
router.get("/", (req, res) => {
  const { q, type } = req.query; // e.g., ?q=john&type=user
  try {
    const results = Engine.search(q, type);
    res.json(results);
  } catch (err) {
    res.status(500).json([]);
  }
});

module.exports = router;
