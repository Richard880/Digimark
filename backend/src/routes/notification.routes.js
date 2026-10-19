const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const authenticate = require("../middleware/authenticate");
const Notification = require("../models/Notification");

const router = express.Router();

const perUser = (limit) =>
  rateLimit({ windowMs: 60 * 1000, limit, keyGenerator: (req) => String(req.user._id), message: { error: "TOO_MANY_REQUESTS" } });
const fail = (res, e, tag) => {
  console.error(`❌ ${tag}:`, e.stack || e.message);
  return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
};

// Everything is scoped to the signed-in user. No userId is ever read from the request.
router.get("/", authenticate, perUser(60), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const logs = await Notification.find({ recipientId: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("-metadata -actorId -__v")
      .lean();
    return res.json(logs);
  } catch (e) { return fail(res, e, "notifications list"); }
});

// For the navbar badge
router.get("/unread-count", authenticate, perUser(120), async (req, res) => {
  try {
    return res.json({ count: await Notification.countDocuments({ recipientId: req.user._id, isRead: false }) });
  } catch (e) { return fail(res, e, "unread count"); }
});

router.post("/mark-all-read", authenticate, perUser(20), async (req, res) => {
  try {
    await Notification.updateMany({ recipientId: req.user._id, isRead: false }, { $set: { isRead: true } });
    return res.json({ ok: true });
  } catch (e) { return fail(res, e, "mark all read"); }
});

router.patch("/:id/read", authenticate, perUser(60), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "INVALID_ID" });
    await Notification.updateOne({ _id: req.params.id, recipientId: req.user._id }, { $set: { isRead: true } });
    return res.json({ ok: true });
  } catch (e) { return fail(res, e, "mark read"); }
});

module.exports = router;
