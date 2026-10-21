const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const authenticate = require("../../middleware/authenticate");
const User = require("../../models/User");
const UserProfile = require("../../models/UserProfile");
const Order = require("../../models/Order");
const Conversation = require("../../models/Conversation");
const Message = require("../../models/Message");
const ChatKey = require("../../models/ChatKey");
const Block = require("../../models/Block");
const Report = require("../../models/Report");
const { notify, emitTo } = require("../../services/notification.service");
const { sendChatAlert } = require("../../services/email.service");

const router = express.Router();
const PAGE = 30;
const TYPING_MS = 6000;
const AWAY_MS = 10 * 60 * 1000;
const HOUR = 3600 * 1000;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const REASONS = ["spam", "scam", "harassment", "inappropriate", "other"];

const E = (message, http = 400) => Object.assign(new Error(message), { http });
const isId = (v) => typeof v === "string" && mongoose.isValidObjectId(v);
const same = (a, b) => String(a) === String(b);
const asDate = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };

const h = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.message });
    console.error("❌ chat:", e.stack || e.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

const perUser = (limit) =>
  rateLimit({ windowMs: 60 * 1000, limit, keyGenerator: (req) => String(req.user._id), message: { error: "TOO_MANY_REQUESTS" } });

// Every chat route needs a signed-in user. Also records "last seen" (at most once a minute) for the offline-email rule.
router.use(authenticate, (req, _res, next) => {
  User.updateOne(
    { _id: req.user._id, $or: [{ chatSeenAt: null }, { chatSeenAt: { $lt: new Date(Date.now() - 60000) } }] },
    { $set: { chatSeenAt: new Date() } }
  ).catch(() => {});
  next();
});

const nameOf = (p) => (p && (p.brandName || p.displayName || p.username)) || "Sokodigi member";
const withInfo = (p) => ({ name: nameOf(p), username: p?.username || "", photo: p?.profilePhoto || "" });

const liveMarketer = (id) =>
  User.exists({
    _id: id, accountCategory: "network", membershipStatus: "active", isActive: true,
    $or: [{ membershipExpiresAt: null }, { membershipExpiresAt: { $gt: new Date() } }],
  });

const isBlocked = (a, b) =>
  Block.exists({ $or: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] });

async function myConversation(id, me) {
  if (!isId(id)) throw E("INVALID_ID");
  const c = await Conversation.findOne({ _id: id, "members.userId": me }).select("members").lean();
  if (!c) throw E("CONVERSATION_NOT_FOUND", 404);
  return c;
}

async function keysOf(userId) {
  const k = await ChatKey.findOne({ userId }).select("keys").lean();
  return k?.keys || [];
}
const currentOf = (keys) => (keys.length ? keys[keys.length - 1] : null);

function checkPublicKey(v) {
  if (typeof v !== "string" || v.length !== 88 || !B64.test(v)) throw E("INVALID_KEY");
  const b = Buffer.from(v, "base64");
  if (b.length !== 65 || b[0] !== 4) throw E("INVALID_KEY"); // an uncompressed P-256 point
}
function checkBackup(b) {
  const ok =
    b && typeof b === "object" &&
    ["salt", "iv", "data"].every((k) => typeof b[k] === "string" && B64.test(b[k])) &&
    b.salt.length === 24 && b.iv.length === 16 && b.data.length >= 100 && b.data.length <= 400 &&
    Number.isInteger(b.iter) && b.iter >= 300000 && b.iter <= 1500000;
  if (!ok) throw E("INVALID_BACKUP");
  return { salt: b.salt, iv: b.iv, data: b.data, iter: b.iter };
}

/* ───────── Encryption keys ───────── */
router.get("/keys/me", perUser(60), h(async (req, res) => {
  const k = await ChatKey.findOne({ userId: req.user._id }).lean();
  if (!k || !k.keys.length) return res.json({ ok: true, exists: false });
  const cur = currentOf(k.keys);
  res.json({ ok: true, exists: true, current: cur.version, publicKey: cur.publicKey, backup: k.backup });
}));

router.put("/keys", perUser(10), h(async (req, res) => {
  checkPublicKey(req.body?.publicKey);
  const backup = checkBackup(req.body?.backup);
  try {
    await ChatKey.create({ userId: req.user._id, keys: [{ version: 1, publicKey: req.body.publicKey }], backup });
  } catch (e) {
    if (e.code === 11000) throw E("KEYS_EXIST", 409);
    throw e;
  }
  res.status(201).json({ ok: true, version: 1 });
}));

// Replacing keys needs a recent sign-in, so a stolen session can't quietly swap them
router.post("/keys/reset", perUser(5), h(async (req, res) => {
  const authTime = Number(req.firebaseUser?.auth_time || 0) * 1000;
  if (!authTime || Date.now() - authTime > 10 * 60 * 1000) throw E("RECENT_LOGIN_REQUIRED", 403);
  checkPublicKey(req.body?.publicKey);
  const backup = checkBackup(req.body?.backup);
  const k = await ChatKey.findOne({ userId: req.user._id }).select("keys").lean();
  if (!k) throw E("NO_KEYS", 404);
  const cur = k.keys.length;
  if (cur >= 50) throw E("TOO_MANY_RESETS", 429);
  const r = await ChatKey.updateOne(
    { userId: req.user._id, $expr: { $eq: [{ $size: "$keys" }, cur] } },
    { $push: { keys: { version: cur + 1, publicKey: req.body.publicKey } }, $set: { backup } }
  );
  if (!r.modifiedCount) throw E("TRY_AGAIN", 409);
  res.json({ ok: true, version: cur + 1 });
}));

/* ───────── Conversations ───────── */
router.post("/start", perUser(20), h(async (req, res) => {
  const me = req.user._id;
  const t = req.body?.targetUserId;
  if (!isId(t)) throw E("INVALID_ID");
  if (same(t, me)) throw E("CANNOT_MESSAGE_SELF");

  const target = await User.findById(t).select("isActive membershipStatus").lean();
  if (!target || !target.isActive || target.membershipStatus === "suspended") throw E("USER_NOT_FOUND", 404);
  if (await isBlocked(me, t)) throw E("CHAT_NOT_ALLOWED", 403);

  const allowed = (await liveMarketer(t)) ||
    (await Order.exists({ $or: [{ buyerId: me, sellerId: t }, { buyerId: t, sellerId: me }] }));
  if (!allowed) throw E("CHAT_NOT_ALLOWED", 403);

  const [a, b] = [String(me), String(t)].sort();
  const pairKey = `${a}_${b}`;
  let convo = await Conversation.findOne({ pairKey }).select("_id").lean();
  let created = false;
  if (!convo) {
    try {
      convo = await Conversation.create({ pairKey, members: [{ userId: a }, { userId: b }] });
      created = true;
    } catch (e) {
      if (e.code !== 11000) throw e;
      convo = await Conversation.findOne({ pairKey }).select("_id").lean();
    }
  }
  const peerReady = !!(await ChatKey.exists({ userId: t }));
  if (created && !peerReady) {
    const p = await UserProfile.findOne({ userId: me }).select("brandName displayName username").lean();
    await notify("CHAT_REQUEST", t, { senderName: nameOf(p) }, { actorId: me });
  }
  res.json({ ok: true, conversationId: convo._id, peerReady });
}));

router.get("/inbox", perUser(60), h(async (req, res) => {
  const me = req.user._id;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const convos = await Conversation.find({ "members.userId": me, "lastMessage.at": { $ne: null } })
    .sort({ lastActivityAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).lean();

  const otherOf = (c) => c.members.find((m) => !same(m.userId, me));
  const peerIds = convos.map((c) => otherOf(c).userId);
  const [profs, keyDocs] = await Promise.all([
    UserProfile.find({ userId: { $in: peerIds } }).select("userId username brandName displayName profilePhoto").lean(),
    ChatKey.find({ userId: { $in: peerIds } }).select("userId keys").lean(),
  ]);
  const profBy = new Map(profs.map((p) => [String(p.userId), p]));
  const keysBy = new Map(keyDocs.map((k) => [String(k.userId), k.keys]));

  res.json({
    ok: true,
    emailAlerts: req.user.chatEmailAlerts !== false,
    items: convos.map((c) => {
      const peer = otherOf(c);
      const lm = c.lastMessage;
      const mineLast = same(lm.senderId, me);
      const peerV = mineLast ? lm.rv : lm.sv; // which of the peer's keys the preview used
      const pk = (keysBy.get(String(peer.userId)) || []).find((k) => k.version === peerV);
      return {
        id: c._id,
        with: withInfo(profBy.get(String(peer.userId))),
        lastMessage: { kind: lm.kind, ciphertext: lm.ciphertext, iv: lm.iv, sv: lm.sv, rv: lm.rv, mine: mineLast, at: lm.at },
        peerKey: pk ? { version: pk.version, publicKey: pk.publicKey } : null,
        unread: c.members.find((m) => same(m.userId, me)).unread,
      };
    }),
  });
}));

router.get("/unread-count", perUser(120), h(async (req, res) => {
  const me = req.user._id;
  const r = await Conversation.aggregate([
    { $match: { "members.userId": me } },
    { $unwind: "$members" },
    { $match: { "members.userId": me } },
    { $group: { _id: null, n: { $sum: "$members.unread" } } },
  ]);
  res.json({ count: r[0]?.n || 0 });
}));

router.patch("/settings", perUser(20), h(async (req, res) => {
  if (typeof req.body?.emailAlerts !== "boolean") throw E("INVALID_SETTING");
  await User.updateOne({ _id: req.user._id }, { $set: { chatEmailAlerts: req.body.emailAlerts } });
  res.json({ ok: true });
}));

/* ───────── Messages ───────── */
router.get("/:id/messages", perUser(120), h(async (req, res) => {
  const me = req.user._id;
  const convo = await myConversation(req.params.id, me);
  const mine = convo.members.find((m) => same(m.userId, me));
  const other = convo.members.find((m) => !same(m.userId, me));

  const before = req.query.before ? asDate(req.query.before) : null;
  const after = req.query.after ? asDate(req.query.after) : null;
  const fields = "senderId kind ciphertext iv sv rv createdAt";
  let rows;
  let hasMore = false;
  if (after) {
    rows = await Message.find({ conversationId: convo._id, createdAt: { $gt: after } }).sort({ createdAt: 1 }).limit(50).select(fields).lean();
  } else {
    const q = { conversationId: convo._id };
    if (before) q.createdAt = { $lt: before };
    const page = await Message.find(q).sort({ createdAt: -1 }).limit(PAGE + 1).select(fields).lean();
    hasMore = page.length > PAGE;
    rows = page.slice(0, PAGE).reverse();
  }

  if (mine.unread > 0) {
    await Conversation.updateOne(
      { _id: convo._id, "members.userId": me },
      { $set: { "members.$.unread": 0, "members.$.lastReadAt": new Date() } }
    );
  }
  const [prof, peerKeys, myKeys, blockedByMe] = await Promise.all([
    UserProfile.findOne({ userId: other.userId }).select("username brandName displayName profilePhoto").lean(),
    keysOf(other.userId),
    keysOf(me),
    Block.exists({ blockerId: me, blockedId: other.userId }),
  ]);
  const peerCur = currentOf(peerKeys);
  res.json({
    ok: true,
    hasMore,
    with: withInfo(prof),
    me: { version: currentOf(myKeys)?.version || 0 },
    peer: { current: peerCur?.version || null, keys: peerKeys.map((k) => ({ version: k.version, publicKey: k.publicKey })) },
    peerTyping: !!(other.typingAt && Date.now() - new Date(other.typingAt).getTime() < TYPING_MS),
    peerReadAt: other.lastReadAt || null,
    blockedByMe: !!blockedByMe,
    messages: rows.map((m) => ({ id: m._id, mine: same(m.senderId, me), kind: m.kind, ciphertext: m.ciphertext, iv: m.iv, sv: m.sv, rv: m.rv, at: m.createdAt })),
  });
}));

router.post("/:id/typing", perUser(30), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const r = await Conversation.updateOne(
    { _id: req.params.id, "members.userId": req.user._id },
    { $set: { "members.$.typingAt": new Date() } }
  );
  if (!r.matchedCount) throw E("CONVERSATION_NOT_FOUND", 404);
  res.json({ ok: true });
}));

router.post("/:id/messages", perUser(20), h(async (req, res) => {
  const me = req.user._id;
  const b = req.body || {};
  const kind = b.kind === "image" ? "image" : "text";
  const { ciphertext, iv, sv, rv } = b;
  if (typeof ciphertext !== "string" || ciphertext.length < 24 || ciphertext.length > 10000 || !B64.test(ciphertext)) throw E("INVALID_MESSAGE");
  if (typeof iv !== "string" || iv.length !== 16 || !B64.test(iv)) throw E("INVALID_MESSAGE");
  if (!Number.isInteger(sv) || !Number.isInteger(rv) || sv < 1 || rv < 1) throw E("INVALID_MESSAGE");

  const convo = await myConversation(req.params.id, me);
  const other = convo.members.find((m) => !same(m.userId, me));
  if (await isBlocked(me, other.userId)) throw E("CHAT_NOT_ALLOWED", 403); // blocked people are never told

  const target = await User.findById(other.userId).select("isActive membershipStatus chatSeenAt emailVerified email").lean();
  if (!target || !target.isActive || target.membershipStatus === "suspended") throw E("RECIPIENT_UNAVAILABLE", 403);

  const [myKey, peerKey] = await Promise.all([keysOf(me).then(currentOf), keysOf(other.userId).then(currentOf)]);
  if (!myKey) throw E("NO_KEYS", 409);
  if (!peerKey) throw E("PEER_NO_KEYS", 409);
  if (myKey.version !== sv || peerKey.version !== rv) throw E("KEYS_CHANGED", 409); // the sender used an out-of-date key

  const msg = await Message.create({ conversationId: convo._id, senderId: me, kind, ciphertext, iv, sv, rv });
  const old = await Conversation.findOneAndUpdate(
    { _id: convo._id, "members.userId": other.userId },
    { $inc: { "members.$.unread": 1 },
      $set: { lastMessage: { kind, ciphertext, iv, sv, rv, senderId: me, at: msg.createdAt }, lastActivityAt: msg.createdAt } },
    { projection: { members: 1 } }
  ).lean();
  const startsStreak = old?.members.find((m) => same(m.userId, other.userId))?.unread === 0;

  if (startsStreak) {
    const p = await UserProfile.findOne({ userId: me }).select("brandName displayName username").lean();
    const name = nameOf(p);
    await notify("NEW_MESSAGE", other.userId, { senderName: name, conversationId: convo._id }, { actorId: me });

    const away = !target.chatSeenAt || Date.now() - new Date(target.chatSeenAt).getTime() > AWAY_MS;
    if (away && target.emailVerified && target.email) {
      const claimed = await User.findOneAndUpdate(
        { _id: other.userId, chatEmailAlerts: { $ne: false }, $or: [{ lastChatEmailAt: null }, { lastChatEmailAt: { $lt: new Date(Date.now() - HOUR) } }] },
        { $set: { lastChatEmailAt: new Date() } },
        { projection: { _id: 1 } }
      );
      if (claimed) await sendChatAlert({ to: target.email, fromName: name });
    }
  }
  emitTo(other.userId, "chat:message", { conversationId: String(convo._id) });
  res.status(201).json({ ok: true, message: { id: msg._id, mine: true, kind, ciphertext, iv, sv, rv, at: msg.createdAt } });
}));

/* ───────── Blocking and reporting ───────── */
router.post("/:id/block", perUser(20), h(async (req, res) => {
  const me = req.user._id;
  const convo = await myConversation(req.params.id, me);
  const other = convo.members.find((m) => !same(m.userId, me));
  try { await Block.create({ blockerId: me, blockedId: other.userId }); }
  catch (e) { if (e.code !== 11000) throw e; }
  res.json({ ok: true });
}));

router.delete("/:id/block", perUser(20), h(async (req, res) => {
  const me = req.user._id;
  const convo = await myConversation(req.params.id, me);
  const other = convo.members.find((m) => !same(m.userId, me));
  await Block.deleteOne({ blockerId: me, blockedId: other.userId });
  res.json({ ok: true });
}));

// body: { conversationId, reason, details?, messages?: [{ id, text }] }
router.post("/report", perUser(5), h(async (req, res) => {
  const me = req.user._id;
  const b = req.body || {};
  if (!REASONS.includes(b.reason)) throw E("INVALID_REASON");
  const details = typeof b.details === "string" ? b.details.trim().slice(0, 500) : "";
  const convo = await myConversation(b.conversationId, me);
  const other = convo.members.find((m) => !same(m.userId, me));

  if (await Report.exists({ reporterId: me, reportedId: other.userId, status: "open", createdAt: { $gt: new Date(Date.now() - 24 * HOUR) } })) {
    throw E("ALREADY_REPORTED", 409);
  }

  // The reporter supplies the text (we can't read it). The sender and time come from OUR records.
  const sent = Array.isArray(b.messages) ? b.messages.slice(0, 10).filter((m) => m && isId(m.id) && typeof m.text === "string") : [];
  const real = await Message.find({ _id: { $in: sent.map((m) => m.id) }, conversationId: convo._id }).select("senderId createdAt").lean();
  const realBy = new Map(real.map((m) => [String(m._id), m]));
  const excerpt = sent.filter((m) => realBy.has(m.id)).map((m) => ({
    messageId: m.id, text: m.text.slice(0, 500), fromReported: same(realBy.get(m.id).senderId, other.userId), at: realBy.get(m.id).createdAt,
  }));

  await Report.create({ reporterId: me, reportedId: other.userId, conversationId: convo._id, reason: b.reason, details, excerpt });
  res.status(201).json({ ok: true });
}));

module.exports = router;
