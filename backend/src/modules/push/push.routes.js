const express = require("express");
const rateLimit = require("express-rate-limit");
const authenticate = require("../../middleware/authenticate");
const User = require("../../models/User");
const PushSubscription = require("../../models/PushSubscription");
const { ENABLED, PUBLIC_KEY, isAllowedEndpoint, sendToUser } = require("../../services/push.service");

const router = express.Router();
const KEY_RE = /^[A-Za-z0-9_-]{16,100}$/;
const CATS = ["ESCROW", "ORDERS", "MESSAGES", "SYSTEM"];
const MAX_DEVICES = 10;

const perUser = (limit) =>
  rateLimit({ windowMs: 60 * 1000, limit, keyGenerator: (req) => String(req.user._id), message: { error: "TOO_MANY_REQUESTS" } });
const E = (message, http = 400) => Object.assign(new Error(message), { http });
const h = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.message });
    console.error("❌ push:", e.stack || e.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// The public key is public by design. The private key never leaves the server.
router.get("/public-key", rateLimit({ windowMs: 60 * 1000, limit: 60 }), (_req, res) =>
  ENABLED ? res.json({ key: PUBLIC_KEY }) : res.status(503).json({ error: "PUSH_NOT_CONFIGURED" }));

router.post("/subscribe", authenticate, perUser(20), h(async (req, res) => {
  if (!ENABLED) throw E("PUSH_NOT_CONFIGURED", 503);
  const s = req.body?.subscription;
  const endpoint = s?.endpoint;
  const p256dh = s?.keys?.p256dh, auth = s?.keys?.auth;
  if (typeof endpoint !== "string" || endpoint.length > 1000 || !isAllowedEndpoint(endpoint)) throw E("INVALID_SUBSCRIPTION");
  if (typeof p256dh !== "string" || typeof auth !== "string" || !KEY_RE.test(p256dh) || !KEY_RE.test(auth)) throw E("INVALID_SUBSCRIPTION");

  // If a different account used this phone before, the device now belongs to whoever is signed in
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { $set: { userId: req.user._id, keys: { p256dh, auth }, userAgent: String(req.get("user-agent") || "").slice(0, 200), failCount: 0, lastSeenAt: new Date() } },
    { upsert: true }
  );

  const mine = await PushSubscription.find({ userId: req.user._id }).sort({ lastSeenAt: -1 }).select("_id").lean();
  if (mine.length > MAX_DEVICES) await PushSubscription.deleteMany({ _id: { $in: mine.slice(MAX_DEVICES).map((m) => m._id) } });
  res.json({ ok: true });
}));

router.post("/unsubscribe", authenticate, perUser(30), h(async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== "string" || endpoint.length > 1000) throw E("INVALID_SUBSCRIPTION");
  await PushSubscription.deleteOne({ endpoint, userId: req.user._id }); // only your own devices
  res.json({ ok: true });
}));

router.get("/prefs", authenticate, perUser(30), h(async (req, res) => {
  const p = req.user.pushPrefs || {};
  res.json({
    ok: true,
    configured: ENABLED,
    prefs: Object.fromEntries(CATS.map((c) => [c, p[c] !== false])),
    hideDetails: req.user.pushHideDetails === true,
  });
}));

router.patch("/prefs", authenticate, perUser(30), h(async (req, res) => {
  const b = req.body || {};
  const set = {};
  for (const c of CATS) if (b[c] !== undefined) { if (typeof b[c] !== "boolean") throw E("INVALID_SETTING"); set[`pushPrefs.${c}`] = b[c]; }
  if (b.hideDetails !== undefined) { if (typeof b.hideDetails !== "boolean") throw E("INVALID_SETTING"); set.pushHideDetails = b.hideDetails; }
  if (!Object.keys(set).length) throw E("NOTHING_TO_UPDATE");
  await User.updateOne({ _id: req.user._id }, { $set: set });
  res.json({ ok: true });
}));

router.post("/test", authenticate, perUser(3), h(async (req, res) => {
  if (!ENABLED) throw E("PUSH_NOT_CONFIGURED", 503);
  const r = await sendToUser(req.user._id, { title: "Sokodigi alerts are on", body: "You'll see order and payment updates like this one.", url: "/notifications", tag: "test" });
  if (!r.sent) throw E("NO_DEVICE_REACHED", 409);
  res.json({ ok: true, sent: r.sent });
}));

module.exports = router;
