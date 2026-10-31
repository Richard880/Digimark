const express = require("express");
const mongoose = require("mongoose");
const authenticate = require("../../middleware/authenticate");
const { perUser } = require("../../middleware/limits");
const { shop, can, E } = require("../../middleware/shop");
const { entitlementsFor } = require("../membership/entitlements");
const SupportTicket = require("../../models/SupportTicket");
const { notifyAdmins } = require("../../services/notification.service");

const router = express.Router();
const isId = (v) => typeof v === "string" && mongoose.isValidObjectId(v);
const txt = (v, min, max) => { const s = typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim() : ""; if (s.length < min || s.length > max) throw E("TEXT_LENGTH_INVALID"); return s; };
const h = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { if (e.http) return res.status(e.http).json({ error: e.message }); console.error("❌ support:", e.stack || e.message); res.status(500).json({ error: "INTERNAL_SERVER_ERROR" }); } };
const owner = [authenticate, shop, can("support")]; // owner only

router.get("/tickets", ...owner, perUser(30), h(async (req, res) => {
  res.json({ ok: true, tickets: await SupportTicket.find({ ownerId: req.shop.ownerId }).sort({ lastMessageAt: -1 }).limit(30).select("subject category priority status lastMessageAt").lean() });
}));
router.get("/tickets/:id", ...owner, perUser(60), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const t = await SupportTicket.findOne({ _id: req.params.id, ownerId: req.shop.ownerId }).select("-__v").lean();
  if (!t) throw E("TICKET_NOT_FOUND", 404);
  res.json({ ok: true, ticket: t });
}));
router.post("/tickets", ...owner, perUser(5), h(async (req, res) => {
  const b = req.body || {};
  const subject = txt(b.subject, 5, 100), text = txt(b.text, 10, 2000);
  const category = ["billing", "inventory", "pos", "network", "other"].includes(b.category) ? b.category : "other";
  if ((await SupportTicket.countDocuments({ ownerId: req.shop.ownerId, status: { $ne: "closed" } })) >= 5) throw E("TOO_MANY_OPEN", 409);
  const priority = !!entitlementsFor(req.shop.owner).features.prioritySupport;
  const t = await SupportTicket.create({ ownerId: req.shop.ownerId, subject, category, priority, messages: [{ by: "member", text }] });
  await notifyAdmins(`${priority ? "PRIORITY " : ""}support ticket: ${subject}`);
  res.status(201).json({ ok: true, id: t._id });
}));
router.post("/tickets/:id/messages", ...owner, perUser(20), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const text = txt(req.body?.text, 1, 2000);
  const r = await SupportTicket.updateOne({ _id: req.params.id, ownerId: req.shop.ownerId, status: { $ne: "closed" }, "messages.49": { $exists: false } },
    { $push: { messages: { by: "member", text, at: new Date() } }, $set: { status: "open", lastMessageAt: new Date() } });
  if (!r.matchedCount) throw E("CANNOT_REPLY", 409);
  res.status(201).json({ ok: true });
}));
router.post("/tickets/:id/close", ...owner, perUser(20), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const r = await SupportTicket.updateOne({ _id: req.params.id, ownerId: req.shop.ownerId, status: { $ne: "closed" } }, { $set: { status: "closed" } });
  if (!r.matchedCount) throw E("CANNOT_REPLY", 409);
  res.json({ ok: true });
}));
module.exports = router;
