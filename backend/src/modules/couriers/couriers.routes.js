const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");
const authenticate = require("../../middleware/authenticate");
const { perUser } = require("../../middleware/limits");
const { shop, can, E } = require("../../middleware/shop");
const Courier = require("../../models/Courier");
const CourierAssignment = require("../../models/CourierAssignment");
const Order = require("../../models/Order");
const UserProfile = require("../../models/UserProfile");
const { notify } = require("../../services/notification.service");
const { audit } = require("../../services/shopAudit");

const router = express.Router();
const VEHICLES = ["motorcycle", "car", "van", "bicycle", "on_foot"];
const MOTOR = ["motorcycle", "car", "van"];
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = () => Array.from({ length: 10 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join("");
const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const hash = (c) => crypto.createHash("sha256").update(c).digest("hex");
const isId = (v) => typeof v === "string" && mongoose.isValidObjectId(v);
const txt = (v, m) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, m) : "");
const nameOf = (p) => (p?.displayName || [p?.firstName, p?.lastName].filter(Boolean).join(" ") || "Courier").slice(0, 80);
const h = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.message });
    if (e.code === 11000) return res.status(409).json({ error: "ALREADY_COURIER" });
    console.error("❌ couriers:", e.stack || e.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};
const owner = [authenticate, shop, can("couriers")]; // the shop owner only

/* ───────── Shop owner ───────── */
router.get("/mine", ...owner, perUser(60), h(async (req, res) => {
  const rows = await Courier.find({ ownerId: req.shop.ownerId, status: { $in: ["invited", "active"] } }).sort({ createdAt: -1 }).select("status label displayName vehicleType plate userId codeExpiresAt").lean();
  const profs = await UserProfile.find({ userId: { $in: rows.map((r) => r.userId).filter(Boolean) } }).select("userId profilePhoto").lean();
  const photo = new Map(profs.map((p) => [String(p.userId), p.profilePhoto]));
  res.json({ ok: true, couriers: rows.map((r) => ({ _id: r._id, status: r.status, label: r.label, name: r.displayName, vehicleType: r.vehicleType, plate: r.plate, photo: photo.get(String(r.userId)) || "", codeExpiresAt: r.codeExpiresAt })) });
}));

router.post("/invites", ...owner, perUser(10), h(async (req, res) => {
  const { ownerId } = req.shop;
  await Courier.deleteMany({ ownerId, status: "invited", codeExpiresAt: { $lt: new Date() } });
  if ((await Courier.countDocuments({ ownerId, status: { $in: ["invited", "active"] } })) >= 10) throw E("COURIER_LIMIT", 403);
  const code = makeCode();
  const c = await Courier.create({ ownerId, label: txt(req.body?.label, 40), codeHash: hash(code), codeExpiresAt: new Date(Date.now() + 3 * 86400000) });
  await audit(req, "courier_invite", { targetType: "courier", targetId: c._id, detail: c.label });
  res.status(201).json({ ok: true, code: `${code.slice(0, 5)}-${code.slice(5)}` }); // shown once: only the hash is stored
}));

router.patch("/:id", ...owner, perUser(30), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const c = await Courier.findOneAndUpdate({ _id: req.params.id, ownerId: req.shop.ownerId, status: { $in: ["invited", "active"] } },
    { $set: { status: "removed", removedAt: new Date() }, $unset: { codeHash: "", codeExpiresAt: "" } });
  if (!c) throw E("COURIER_NOT_FOUND", 404);
  await unassignOpen(req.shop.ownerId, c._id);
  await audit(req, "courier_remove", { targetType: "courier", targetId: c._id, detail: c.displayName || c.label });
  res.json({ ok: true });
}));

async function unassignOpen(ownerId, memberId) {
  await Order.updateMany({ sellerId: ownerId, "courier.memberId": memberId, orderStatus: { $in: ["PROCESSING", "DISPATCHED"] } }, { $unset: { courier: "" } });
  await CourierAssignment.deleteMany({ ownerId, courierId: memberId });
}

// body: { orderNumber, courierId (or null to unassign), feeNote? }. Only confirmed (on the way) orders.
router.post("/assign", ...owner, perUser(30), h(async (req, res) => {
  const { ownerId } = req.shop;
  const orderNumber = String(req.body?.orderNumber || "").toUpperCase().slice(0, 30);
  if (!orderNumber) throw E("INVALID_ORDER_NUMBER");
  let m = null, snap = null;
  if (req.body?.courierId) {
    if (!isId(String(req.body.courierId))) throw E("INVALID_ID");
    m = await Courier.findOne({ _id: req.body.courierId, ownerId, status: "active" }).lean();
    if (!m) throw E("COURIER_NOT_FOUND", 404);
    const p = await UserProfile.findOne({ userId: m.userId }).select("profilePhoto").lean();
    snap = { memberId: m._id, name: m.displayName, photo: p?.profilePhoto || "", vehicleType: m.vehicleType, plate: m.plate, assignedAt: new Date() };
  }
  const o = await Order.findOneAndUpdate({ orderNumber, sellerId: ownerId, orderStatus: "DISPATCHED", isEscrowReleased: false },
    snap ? { $set: { courier: snap } } : { $unset: { courier: "" } }, { new: true }).select("buyerId orderNumber");
  if (!o) throw E((await Order.exists({ orderNumber, sellerId: ownerId })) ? "ORDER_NOT_ASSIGNABLE" : "ORDER_NOT_FOUND", (await Order.exists({ orderNumber, sellerId: ownerId })) ? 409 : 404);

  if (!m) await CourierAssignment.deleteOne({ orderId: o._id });
  else {
    await CourierAssignment.updateOne({ orderId: o._id }, { $set: { ownerId, courierId: m._id, note: txt(req.body?.feeNote, 120) } }, { upsert: true });
    const vehicle = { motorcycle: "motorcycle", car: "car", van: "van", bicycle: "bicycle", on_foot: "foot" }[m.vehicleType];
    await notify("COURIER_ASSIGNED", o.buyerId, { orderId: o._id, orderRef: o.orderNumber, courierName: m.displayName, vehicle }, { actorId: req.user._id });
    await notify("COURIER_JOB", m.userId, { orderId: o._id, orderRef: o.orderNumber, shopName: req.shop.memberName === "Owner" ? "your shop" : "the shop" });
  }
  await audit(req, m ? "courier_assign" : "courier_unassign", { targetType: "order", targetId: o._id, detail: `${o.orderNumber}${m ? ` to ${m.displayName}` : ""}` });
  res.json({ ok: true });
}));

/* ───────── The courier ───────── */
router.post("/join", authenticate.strict, perUser(5), h(async (req, res) => {
  const b = req.body || {};
  const code = norm(b.code);
  if (code.length !== 10) throw E("INVALID_CODE", 404);
  if (!VEHICLES.includes(b.vehicleType)) throw E("INVALID_VEHICLE");
  let plate = "";
  if (MOTOR.includes(b.vehicleType)) {
    plate = norm(b.plate);
    if (!/^[A-Z]{3,4}\d{3}[A-Z]$/.test(plate)) throw E("INVALID_PLATE");
    plate = plate.replace(/^([A-Z]{3,4})(\d{3}[A-Z])$/, "$1 $2");
  }
  const p = await UserProfile.findOne({ userId: req.user._id }).select("profilePhoto displayName firstName lastName").lean();
  if (!p?.profilePhoto) throw E("PHOTO_REQUIRED"); // buyers must be able to see who is coming
  const c = await Courier.findOneAndUpdate(
    { codeHash: hash(code), status: "invited", codeExpiresAt: { $gt: new Date() }, ownerId: { $ne: req.user._id } },
    { $set: { userId: req.user._id, status: "active", vehicleType: b.vehicleType, plate, displayName: nameOf(p), joinedAt: new Date() }, $unset: { codeHash: "", codeExpiresAt: "" } });
  if (!c) throw E("INVALID_CODE", 404); // wrong, used and expired codes look the same
  res.json({ ok: true });
}));

router.get("/jobs", authenticate, perUser(60), h(async (req, res) => {
  const mine = await Courier.find({ userId: req.user._id, status: "active" }).select("ownerId vehicleType plate").lean();
  if (!mine.length) return res.json({ ok: true, shops: [], jobs: [] });
  const ownerIds = mine.map((m) => m.ownerId), memberIds = mine.map((m) => m._id);
  const [profs, orders] = await Promise.all([
    UserProfile.find({ userId: { $in: ownerIds } }).select("userId brandName displayName").lean(),
    Order.find({ sellerId: { $in: ownerIds }, "courier.memberId": { $in: memberIds }, orderStatus: "DISPATCHED", isEscrowReleased: false })
      .sort({ dispatchedAt: 1 }).limit(50).select("orderNumber sellerId items shippingDetails scheduledFor dispatchedAt courier.memberId").lean(),
  ]);
  const shopName = new Map(profs.map((p) => [String(p.userId), p.brandName || p.displayName || "Shop"]));
  const notes = new Map((await CourierAssignment.find({ orderId: { $in: orders.map((o) => o._id) } }).select("orderId note").lean()).map((n) => [String(n.orderId), n.note]));
  res.json({
    ok: true,
    shops: mine.map((m) => ({ memberId: m._id, name: shopName.get(String(m.ownerId)) || "Shop", vehicleType: m.vehicleType, plate: m.plate })),
    jobs: orders.map((o) => ({
      orderNumber: o.orderNumber, shop: shopName.get(String(o.sellerId)) || "Shop", scheduledFor: o.scheduledFor || null, since: o.dispatchedAt,
      items: o.items.map((i) => ({ name: i.name, quantity: i.quantity })), // never prices
      to: { name: o.shippingDetails.fullName, phone: o.shippingDetails.phoneNumber, county: o.shippingDetails.county, subCounty: o.shippingDetails.subCounty, notes: o.shippingDetails.deliveryNotes },
      feeNote: notes.get(String(o._id)) || "",
    })),
  });
}));

router.post("/leave/:id", authenticate, perUser(10), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const c = await Courier.findOneAndUpdate({ _id: req.params.id, userId: req.user._id, status: "active" }, { $set: { status: "removed", removedAt: new Date() } });
  if (!c) throw E("COURIER_NOT_FOUND", 404);
  await unassignOpen(c.ownerId, c._id);
  res.json({ ok: true });
}));

module.exports = router;
