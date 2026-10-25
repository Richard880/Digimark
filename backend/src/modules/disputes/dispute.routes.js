const express = require("express");
const mongoose = require("mongoose");
const authenticate = require("../../middleware/authenticate");
const { perUser } = require("../../middleware/limits");
const Order = require("../../models/Order");
const Dispute = require("../../models/Dispute");
const { notify, notifyAdmins } = require("../../services/notification.service");
const C = require("../../config/orders");

const router = express.Router();
const BUYER_REASONS = ["not_received", "not_as_described", "damaged", "other"];
const SELLER_REASONS = ["buyer_unresponsive", "other"];

const same = (a, b) => String(a) === String(b);
const isId = (v) => typeof v === "string" && mongoose.isValidObjectId(v);
const E = (message, http = 400) => Object.assign(new Error(message), { http });
const h = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.message });
    if (e.code === 11000) return res.status(409).json({ error: "DISPUTE_ALREADY_EXISTS" });
    console.error("❌ dispute:", e.stack || e.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

const cleanText = (v, min, max) => {
  const s = typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim() : "";
  if (s.length < min || s.length > max) throw E(min ? "TEXT_LENGTH_INVALID" : "TEXT_TOO_LONG");
  return s;
};

// Evidence photos must be in OUR Cloudinary disputes folder AND uploaded by the person submitting them
function cleanImages(list, userId) {
  if (list === undefined) return [];
  const cloud = (process.env.CLOUDINARY_CLOUD_NAME || "").replace(/[^\w-]/g, "");
  if (!Array.isArray(list) || list.length > 3 || !cloud) throw E("INVALID_IMAGES");
  const re = new RegExp(`^https://res\\.cloudinary\\.com/${cloud}/image/upload/(v\\d+/)?sokodigi/disputes/${String(userId)}_[a-f0-9]{16}\\.(jpg|jpeg|png|webp)$`);
  return list.map((u) => { if (typeof u !== "string" || !re.test(u)) throw E("INVALID_IMAGES"); return u; });
}

const partyOrder = (orderNumber, me, fields = "") =>
  Order.findOne({ orderNumber: String(orderNumber || "").toUpperCase().slice(0, 30), $or: [{ buyerId: me }, { sellerId: me }] }).select(fields || undefined);

/** Open a dispute */
router.post("/", authenticate.strict, perUser(5), h(async (req, res) => {
  const me = req.user._id;
  const b = req.body || {};
  const order = await partyOrder(b.orderNumber, me).lean();
  if (!order) throw E("ORDER_NOT_FOUND", 404);
  const role = same(order.buyerId, me) ? "buyer" : "seller";

  if (order.orderStatus !== "DISPATCHED" || order.isEscrowReleased) throw E("DISPUTE_NOT_ALLOWED", 409);
  if (role === "seller" && Date.now() < new Date(order.dispatchedAt).getTime() + C.SELLER_DISPUTE_AFTER_MS) throw E("TOO_EARLY", 409);
  if (!(role === "buyer" ? BUYER_REASONS : SELLER_REASONS).includes(b.reason)) throw E("INVALID_REASON");
  const details = cleanText(b.details, 10, 1000);
  const images = cleanImages(b.images, me);

  const dispute = await mongoose.connection.transaction(async (session) => {
    // The status flip is the lock: it freezes the PIN release, cancellation and the timers in one step
    const claimed = await Order.findOneAndUpdate(
      { _id: order._id, orderStatus: "DISPATCHED", isEscrowReleased: false },
      { $set: { orderStatus: "DISPUTED", statusBeforeDispute: "DISPATCHED" } },
      { session }
    );
    if (!claimed) throw E("DISPUTE_NOT_ALLOWED", 409);
    const [d] = await Dispute.create([{
      orderId: order._id, orderNumber: order.orderNumber, buyerId: order.buyerId, sellerId: order.sellerId,
      openedBy: me, openedByRole: role, reason: b.reason, amount: order.financials.totalRetailPaid,
      messages: [{ by: role, userId: me, text: details, images }],
    }], { session });
    await Order.updateOne({ _id: order._id }, { $set: { disputeId: d._id } }, { session });
    return d;
  });

  const other = role === "buyer" ? order.sellerId : order.buyerId;
  await notify("DISPUTE_OPENED", other, { orderId: order._id, orderRef: order.orderNumber, audience: role === "buyer" ? "seller" : "buyer" });
  await notifyAdmins(`Dispute opened on order #${order.orderNumber} (${b.reason.replace(/_/g, " ")}).`);
  res.status(201).json({ ok: true, disputeId: dispute._id });
}));

/** The dispute for an order (parties only) */
router.get("/order/:orderNumber", authenticate, perUser(60), h(async (req, res) => {
  const me = req.user._id;
  const order = await partyOrder(req.params.orderNumber, me, "buyerId sellerId").lean();
  if (!order) throw E("ORDER_NOT_FOUND", 404);
  const d = await Dispute.findOne({ orderId: order._id }).lean();
  if (!d) return res.json({ ok: true, dispute: null });
  res.json({
    ok: true,
    dispute: {
      id: d._id, status: d.status, reason: d.reason, openedByMe: same(d.openedBy, me), myRole: same(d.buyerId, me) ? "buyer" : "seller",
      createdAt: d.createdAt, resolution: d.resolution?.at ? { note: d.resolution.note, at: d.resolution.at } : null,
      messages: d.messages.map((m) => ({ by: m.by, mine: !!m.userId && same(m.userId, me), text: m.text, images: m.images, at: m.createdAt })),
    },
  });
}));

/** Add a reply (text and/or up to 3 photos) */
router.post("/:id/messages", authenticate.strict, perUser(20), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const me = req.user._id;
  const d = await Dispute.findOne({ _id: req.params.id, $or: [{ buyerId: me }, { sellerId: me }] }).select("status buyerId sellerId orderId orderNumber").lean();
  if (!d) throw E("NOT_FOUND", 404);
  if (d.status !== "open") throw E("DISPUTE_CLOSED", 409);
  const role = same(d.buyerId, me) ? "buyer" : "seller";
  const text = req.body?.text ? cleanText(req.body.text, 1, 1000) : "";
  const images = cleanImages(req.body?.images, me);
  if (!text && !images.length) throw E("EMPTY_MESSAGE");

  const r = await Dispute.updateOne(
    { _id: d._id, status: "open", [`messages.${C.MAX_DISPUTE_MESSAGES - 1}`]: { $exists: false } },
    { $push: { messages: { by: role, userId: me, text, images, createdAt: new Date() } } }
  );
  if (!r.matchedCount) throw E("MESSAGE_LIMIT_REACHED", 409);
  await notify("DISPUTE_UPDATE", role === "buyer" ? d.sellerId : d.buyerId, { orderId: d.orderId, orderRef: d.orderNumber, audience: role === "buyer" ? "seller" : "buyer" });
  res.status(201).json({ ok: true });
}));

/** The person who opened it can withdraw it once it's sorted out. The order carries on. */
router.post("/:id/withdraw", authenticate.strict, perUser(10), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const me = req.user._id;
  let d;
  await mongoose.connection.transaction(async (session) => {
    d = await Dispute.findOneAndUpdate({ _id: req.params.id, status: "open", openedBy: me }, { $set: { status: "withdrawn" } }, { session });
    if (!d) throw E("CANNOT_WITHDRAW", 409);
    const o = await Order.findOneAndUpdate({ _id: d.orderId, orderStatus: "DISPUTED" }, { $set: { orderStatus: "DISPATCHED" }, $unset: { statusBeforeDispute: "" } }, { session });
    if (!o) throw E("CANNOT_WITHDRAW", 409);
  });
  const toSeller = same(d.openedBy, d.buyerId);
  await notify("DISPUTE_WITHDRAWN", toSeller ? d.sellerId : d.buyerId, { orderId: d.orderId, orderRef: d.orderNumber, audience: toSeller ? "seller" : "buyer" });
  res.json({ ok: true });
}));

module.exports = router;
