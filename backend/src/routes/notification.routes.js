const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");

// 🎯 FIXES GET /api/notifications (404)
router.get("/", async (req, res) => {
  try {
    // If you have authentication middleware setup (like req.user.id), replace "test-user-id" with req.user.id
    const userId = req.user?.id || req.query.userId || "test-user-id"; 
    
    const logs = await Notification.find({ recipientId: userId })
      .sort({ createdAt: -1 })
      .limit(50);
      
    return res.status(200).json(logs);
  } catch (err) {
    console.error("Failed to read notification schemas:", err);
    return res.status(500).json({ error: "Internal ledger processing crash." });
  }
});

// 🎯 FIXES POST /api/notifications/mark-all-read (404)
router.post("/mark-all-read", async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId || "test-user-id";
    
    await Notification.updateMany(
      { recipientId: userId, isRead: false },
      { $set: { isRead: true } }
    );
    
    return res.status(200).json({ success: true, status: "All notifications updated cleanly." });
  } catch (err) {
    console.error("Failed to update notification logs:", err);
    return res.status(500).json({ error: "Failed to update logs." });
  }
});

module.exports = router;
