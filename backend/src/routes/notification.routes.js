// 📁 File: backend/routes/notification.routes.js
const express = require("express");
const router = express.Router();
const authenticate = require("../../middleware/authenticate"); // Use your existing token signature parser
const Notification = require("../models/Notification");

/**
 * 🔔 GET /api/notifications
 * Retrieves all real-time system tracking alerts for the logged-in user
 */
router.get("/", authenticate, async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    const logs = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.status(200).json(logs);
  } catch (error) {
    console.error("❌ Notification fetch error:", error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

module.exports = router;
