const express = require("express");
const mongoose = require("mongoose");
const authenticate = require("../../middleware/authenticate");
const { perUser } = require("../../middleware/limits");
const Courier = require("../../models/Courier");
const Order = require("../../models/Order");
const Trip = require("../../models/Trip");
const { notify } = require("../../services/notification.service");

const router = express.Router();
const E = (message, http = 400) => Object.assign(new Error(message), { http });
const isId = (v) => typeof v === "string" && mongoose.isValidObjectId(v);
const h = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.message });
    console.error("❌ tracking:", e.stack || e.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};
const soon = (ms) => new Date(Date.now() + ms);

// The order must be on its way and assigned to one of MY courier registrations
async function myJob(me, orderNumber) {
  const mine = await Courier.find({ userId: me, status: "active" }).select("_id displayName vehicleType").lean();
  if (!mine.length) throw E("NOT_A_COURIER", 403);
  const o = await Order.findOne({ orderNumber: String(orderNumber || "").toUpperCase().slice(0, 30), "courier.memberId": { $in: mine.map((m) => m._id) }, orderStatus: "DISPATCHED", isEscrowReleased: false })
    .select("buyerId sellerId orderNumber courier").lean();
  if (!o) throw E("JOB_NOT_FOUND", 404);
  return { o, member: mine.find((m) => String(m._id) === String(o.courier.memberId)) };
}

router.post("/trips/start", authenticate, perUser(20), h(async (req, res) => {
  const { o, member } = await myJob(req.user._id, req.body?.orderNumber);
  const before = await Trip.findOne({ orderId: o._id }).select("active").lean();
  await Trip.updateMany({ courierUserId: req.user._id, orderId: { $ne: o._id }, active: true }, { $set: { active: false, expireAt: soon(10 * 60 * 1000) } }); // one trip at a time
  await Trip.updateOne({ orderId: o._id }, {
    $set: { orderNumber: o.orderNumber, ownerId: o.sellerId, buyerId: o.buyerId, courierUserId: req.user._id, courierName: member.displayName, vehicleType: member.vehicleType, active: true, expireAt: soon(6 * 3600 * 1000) },
    $setOnInsert: { startedAt: new Date() },
  }, { upsert: true });
  if (!before?.active) await notify("TRIP_STARTED", o.buyerId, { orderId: o._id, orderRef: o.orderNumber, courierName: member.displayName });
  res.json({ ok: true });
}));

router.post("/trips/ping", authenticate, perUser(12), h(async (req, res) => {
  const b = req.body || {};
  const lat = Number(b.lat), lng = Number(b.lng), acc = Number(b.accuracy) || 0;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -5 || lat > 6 || lng < 33 || lng > 42) throw E("INVALID_LOCATION"); // a rough box around Kenya
  const r = await Trip.updateOne({ orderNumber: String(b.orderNumber || "").toUpperCase().slice(0, 30), courierUserId: req.user._id, active: true },
    { $set: { lat, lng, accuracy: Math.min(5000, Math.max(0, acc)), pingedAt: new Date(), expireAt: soon(6 * 3600 * 1000) } });
  if (!r.matchedCount) throw E("TRIP_NOT_ACTIVE", 409);
  res.json({ ok: true });
}));

router.post("/trips/end", authenticate, perUser(20), h(async (req, res) => {
  await Trip.updateMany({ courierUserId: req.user._id, orderNumber: String(req.body?.orderNumber || "").toUpperCase().slice(0, 30) }, { $set: { active: false, expireAt: soon(5 * 60 * 1000) }, $unset: { lat: "", lng: "" } });
  res.json({ ok: true });
}));

// The buyer's own trips only. Optional filters: orderNumber, or sellerId (for the chat with that shop).
router.get("/mine", authenticate, perUser(60), h(async (req, res) => {
  const f = { buyerId: req.user._id, active: true };
  if (typeof req.query.orderNumber === "string") f.orderNumber = req.query.orderNumber.toUpperCase().slice(0, 30);
  if (req.query.sellerId !== undefined) { if (!isId(String(req.query.sellerId))) throw E("INVALID_ID"); f.ownerId = req.query.sellerId; }
  const trips = await Trip.find(f).limit(10).lean();
  const live = new Set((await Order.find({ _id: { $in: trips.map((t) => t.orderId) }, orderStatus: "DISPATCHED" }).select("_id").lean()).map((o) => String(o._id)));
  res.json({ ok: true, trips: trips.filter((t) => live.has(String(t.orderId))).map((t) => ({
    orderNumber: t.orderNumber, courierName: t.courierName, vehicleType: t.vehicleType,
    waiting: t.lat == null, lat: t.lat, lng: t.lng, accuracy: t.accuracy, pingedAt: t.pingedAt,
    stale: !t.pingedAt || Date.now() - new Date(t.pingedAt).getTime() > 120000,
  })) });
}));

module.exports = router;
