const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const authenticate = require("../../middleware/authenticate");
const User = require("../../models/User");
const UserProfile = require("../../models/UserProfile");
const Order = require("../../models/Order");
const Conversation = require("../../models/Conversation");
const Message = require("../../models/Message");
const { notify, emitTo } = require("../../services/notification.service");

const router = express.Router();
const PAGE = 30;

const E = (message, http = 400) => Object.assign(new Error(message), { http });
const isId = (v) => typeof v === "string" && mongoose.isValidObjectId(v);
const same = (a, b) => String(a) === String(b);
const asDate = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const cleanText = (v) =>
  typeof v === "string"
    ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\n{3,}/g, "\n\n").trim()
    : "";

const h = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.message });
    console.error("❌ chat:", e.stack || e.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// Runs after authenticate, so each user gets their own allowance
const perUser = (limit) =>
  rateLimit({ windowMs: 60 * 1000, limit, keyGenerator: (req) => String(req.user._id), message: { error: "TOO_MANY_REQUESTS" } });

const nameOf = (p) => (p && (p.brandName || p.displayName || p.username)) || "Sokodigi member";
const withInfo = (p) => ({ name: nameOf(p), username: p?.username || "", photo: p?.profilePhoto || "" });

const liveMarketer = (id) =>
  User.exists({
    _id: id, accountCategory: "network", membershipStatus: "active", isActive: true,
    $or: [{ membershipExpiresAt: null }, { membershipExpiresAt: { $gt: new Date() } }],
  });

// The conversation, only if I'm one of its two members. Anyone else gets "not found".
async function myConversation(id, me) {
  if (!isId(id)) throw E("INVALID_ID");
  const c = await Conversation.findOne({ _id: id, "members.userId": me }).select("members").lean();
  if (!c) throw E("CONVERSATION_NOT_FOUND", 404);
  return c;
}

/** POST /api/chats/start { targetUserId }: finds or creates the conversation */
router.post("/start", authenticate, perUser(20), h(async (req, res) => {
  const t = req.body?.targetUserId;
  if (!isId(t)) throw E("INVALID_ID");
  if (same(t, req.user._id)) throw E("CANNOT_MESSAGE_SELF");

  const target = await User.findById(t).select("isActive membershipStatus").lean();
  if (!target || !target.isActive || target.membershipStatus === "suspended") throw E("USER_NOT_FOUND", 404);

  const allowed =
    (await liveMarketer(t)) ||
    (await Order.exists({ $or: [{ buyerId: req.user._id, sellerId: t }, { buyerId: t, sellerId: req.user._id }] }));
  if (!allowed) throw E("CHAT_NOT_ALLOWED", 403);

  const [a, b] = [String(req.user._id), String(t)].sort();
  const pairKey = `${a}_${b}`;
  let convo = await Conversation.findOne({ pairKey }).select("_id").lean();
  if (!convo) {
    try {
      convo = await Conversation.create({ pairKey, members: [{ userId: a }, { userId: b }] });
    } catch (e) {
      if (e.code !== 11000) throw e; // two taps at once: reuse the winner
      convo = await Conversation.findOne({ pairKey }).select("_id").lean();
    }
  }
  res.json({ ok: true, conversationId: convo._id });
}));

/** GET /api/chats/inbox: my conversations, newest first */
router.get("/inbox", authenticate, perUser(60), h(async (req, res) => {
  const me = req.user._id;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const convos = await Conversation.find({ "members.userId": me, "lastMessage.at": { $ne: null } })
    .sort({ lastActivityAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).lean();

  const otherOf = (c) => c.members.find((m) => !same(m.userId, me));
  const profs = await UserProfile.find({ userId: { $in: convos.map((c) => otherOf(c).userId) } })
    .select("userId username brandName displayName profilePhoto").lean();
  const by = new Map(profs.map((p) => [String(p.userId), p]));

  res.json({
    ok: true,
    items: convos.map((c) => ({
      id: c._id,
      with: withInfo(by.get(String(otherOf(c).userId))),
      lastMessage: { text: c.lastMessage.text, mine: same(c.lastMessage.senderId, me), at: c.lastMessage.at },
      unread: c.members.find((m) => same(m.userId, me)).unread,
    })),
  });
}));

/** GET /api/chats/unread-count: for the navbar badge */
router.get("/unread-count", authenticate, perUser(120), h(async (req, res) => {
  const me = req.user._id;
  const r = await Conversation.aggregate([
    { $match: { "members.userId": me } },
    { $unwind: "$members" },
    { $match: { "members.userId": me } },
    { $group: { _id: null, n: { $sum: "$members.unread" } } },
  ]);
  res.json({ count: r[0]?.n || 0 });
}));

/** GET /api/chats/:id/messages[?before=ISO | ?after=ISO]: the latest page, older ones, or only new ones */
router.get("/:id/messages", authenticate, perUser(120), h(async (req, res) => {
  const me = req.user._id;
  const convo = await myConversation(req.params.id, me);
  const mine = convo.members.find((m) => same(m.userId, me));
  const other = convo.members.find((m) => !same(m.userId, me));

  const before = req.query.before ? asDate(req.query.before) : null;
  const after = req.query.after ? asDate(req.query.after) : null;
  let rows;
  let hasMore = false;
  if (after) {
    rows = await Message.find({ conversationId: convo._id, createdAt: { $gt: after } }).sort({ createdAt: 1 }).limit(50).lean();
  } else {
    const q = { conversationId: convo._id };
    if (before) q.createdAt = { $lt: before };
    const page = await Message.find(q).sort({ createdAt: -1 }).limit(PAGE + 1).lean();
    hasMore = page.length > PAGE;
    rows = page.slice(0, PAGE).reverse();
  }

  if (mine.unread > 0) {
    await Conversation.updateOne(
      { _id: convo._id, "members.userId": me },
      { $set: { "members.$.unread": 0, "members.$.lastReadAt": new Date() } }
    );
  }
  const prof = await UserProfile.findOne({ userId: other.userId }).select("username brandName displayName profilePhoto").lean();
  res.json({
    ok: true,
    hasMore,
    with: withInfo(prof),
    messages: rows.map((m) => ({ id: m._id, mine: same(m.senderId, me), text: m.text, at: m.createdAt })),
  });
}));

/** POST /api/chats/:id/messages { text } */
router.post("/:id/messages", authenticate, perUser(20), h(async (req, res) => {
  const me = req.user._id;
  const text = cleanText(req.body?.text);
  if (!text) throw E("EMPTY_MESSAGE");
  if (text.length > 2000) throw E("MESSAGE_TOO_LONG");

  const convo = await myConversation(req.params.id, me);
  const other = convo.members.find((m) => !same(m.userId, me));
  const target = await User.findById(other.userId).select("isActive membershipStatus").lean();
  if (!target || !target.isActive || target.membershipStatus === "suspended") throw E("RECIPIENT_UNAVAILABLE", 403);

  const msg = await Message.create({ conversationId: convo._id, senderId: me, text });

  // Atomic: bump their unread count and the preview. The returned (old) document tells us if this starts a new unread streak.
  const old = await Conversation.findOneAndUpdate(
    { _id: convo._id, "members.userId": other.userId },
    { $inc: { "members.$.unread": 1 },
      $set: { lastMessage: { text: text.slice(0, 140), senderId: me, at: msg.createdAt }, lastActivityAt: msg.createdAt } },
    { projection: { members: 1 } }
  ).lean();
  const wasRead = old?.members.find((m) => same(m.userId, other.userId))?.unread === 0;

  const myProf = await UserProfile.findOne({ userId: me }).select("brandName displayName username").lean();
  if (wasRead) await notify("NEW_MESSAGE", other.userId, { senderName: nameOf(myProf), conversationId: convo._id }, { actorId: me });
  emitTo(other.userId, "chat:message", { conversationId: String(convo._id) }); // instant push where sockets run; polling covers the rest

  res.status(201).json({ ok: true, message: { id: msg._id, mine: true, text, at: msg.createdAt } });
}));

module.exports = router;
