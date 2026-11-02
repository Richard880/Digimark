const express = require("express");
const mongoose = require("mongoose");
const authenticate = require("../../middleware/authenticate");
const { perUser } = require("../../middleware/limits");
const ShoppingList = require("../../models/ShoppingList");
const Product = require("../../models/Product");
const { review, rollForward, MIN_LEAD_MS } = require("./lists.service");

const router = express.Router();
const isId = (v) => typeof v === "string" && mongoose.isValidObjectId(v);
const E = (message, http = 400) => Object.assign(new Error(message), { http });
const t = (v, m) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, m) : "");
const h = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.message });
    console.error("❌ lists:", e.stack || e.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

const view = (l) => ({
  id: l._id, name: l.name, status: l.status, reason: l.reason || "", repeat: l.repeat, deliveryAt: l.deliveryAt, address: l.address || null,
  items: l.items.map((i) => ({ id: i._id, productId: i.productId, name: i.name, barcode: i.barcode, quantity: i.quantity, mode: i.mode })),
  blocked: l.blockedSellers || [], lastRun: l.lastRun || null, updatedAt: l.updatedAt,
});
const mine = async (req) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const l = await ShoppingList.findOne({ _id: req.params.id, buyerId: req.user._id });
  if (!l) throw E("LIST_NOT_FOUND", 404);
  return l;
};
const qty = (v) => { if (!Number.isInteger(v) || v < 1 || v > 100) throw E("INVALID_QUANTITY"); return v; };

async function orderable(productId, buyerId) {
  if (!isId(String(productId))) throw E("INVALID_ID");
  const p = await Product.findOne({ _id: productId, status: { $in: ["LISTED", "ACTIVE"] }, isShelved: { $ne: false } }).select("name sellerId barcode").lean();
  if (!p) throw E("PRODUCT_UNAVAILABLE", 404);
  if (String(p.sellerId) === String(buyerId)) throw E("OWN_PRODUCT", 409);
  return p;
}

function cleanAddress(a) {
  const fullName = t(a?.fullName, 80), county = t(a?.county, 40), subCounty = t(a?.subCounty, 40);
  let phone = String(a?.phoneNumber || "").replace(/[\s+-]/g, "");
  if (/^0[17]\d{8}$/.test(phone)) phone = `254${phone.slice(1)}`;
  if (!fullName || !county || !subCounty || !/^254[17]\d{8}$/.test(phone)) throw E("INVALID_ADDRESS");
  return { fullName, phoneNumber: phone, county, subCounty, deliveryNotes: t(a?.deliveryNotes, 300) };
}
function cleanTime(v) {
  const d = new Date(v);
  if (!v || Number.isNaN(d.getTime())) throw E("INVALID_TIME");
  const lead = d.getTime() - Date.now();
  if (lead < MIN_LEAD_MS) throw E("DELIVERY_TOO_SOON");
  const hour = (d.getUTCHours() + 3) % 24; // Nairobi time
  if (lead > 90 * 86400000 || hour < 6 || hour >= 21) throw E("INVALID_TIME");
  return d;
}

router.get("/", authenticate, perUser(60), h(async (req, res) => {
  res.json({ ok: true, lists: (await ShoppingList.find({ buyerId: req.user._id }).sort({ updatedAt: -1 }).limit(20).lean()).map(view) });
}));

router.post("/", authenticate, perUser(20), h(async (req, res) => {
  const name = t(req.body?.name, 60);
  if (!name) throw E("INVALID_NAME");
  if ((await ShoppingList.countDocuments({ buyerId: req.user._id })) >= 10) throw E("LIST_LIMIT", 403);
  const items = [];
  if (req.body?.productId) { const p = await orderable(req.body.productId, req.user._id); items.push({ productId: p._id, name: p.name, barcode: p.barcode || "", quantity: qty(req.body.quantity ?? 1) }); }
  const l = await ShoppingList.create({ buyerId: req.user._id, name, items });
  res.status(201).json({ ok: true, id: l._id });
}));

router.post("/:id/add", authenticate, perUser(60), h(async (req, res) => {
  const l = await mine(req);
  const p = await orderable(req.body?.productId, req.user._id);
  const q = qty(req.body?.quantity ?? 1);
  const cur = l.items.find((i) => String(i.productId) === String(p._id));
  if (cur) cur.quantity = Math.min(100, cur.quantity + q);
  else { if (l.items.length >= 30) throw E("ITEM_LIMIT", 403); l.items.push({ productId: p._id, name: p.name, barcode: p.barcode || "", quantity: q }); }
  if (["active", "paused"].includes(l.status)) { l.status = "needs_review"; l.reason = "edited"; }
  await l.save();
  res.json({ ok: true });
}));

// Replace quantities and vendor modes. Items left out are removed.
router.put("/:id", authenticate, perUser(60), h(async (req, res) => {
  const l = await mine(req);
  if (req.body?.name !== undefined) { const n = t(req.body.name, 60); if (!n) throw E("INVALID_NAME"); l.name = n; }
  if (Array.isArray(req.body?.items)) {
    const next = [];
    for (const e of req.body.items.slice(0, 30)) {
      const cur = l.items.id(e?.id);
      if (!cur) throw E("ITEM_NOT_FOUND", 404);
      cur.quantity = qty(e.quantity);
      cur.mode = e.mode === "auto" ? "auto" : "this_vendor";
      if (cur.mode === "auto" && !cur.barcode) throw E("AUTO_NEEDS_BARCODE");
      next.push(cur);
    }
    l.items = next;
    if (["active", "paused"].includes(l.status)) { l.status = "needs_review"; l.reason = "edited"; }
  }
  await l.save();
  res.json({ ok: true });
}));

router.put("/:id/schedule", authenticate, perUser(30), h(async (req, res) => {
  const l = await mine(req);
  const b = req.body || {};
  if (!["none", "daily", "weekly", "biweekly", "monthly"].includes(b.repeat)) throw E("INVALID_REPEAT");
  l.deliveryAt = cleanTime(b.deliveryAt); l.repeat = b.repeat; l.address = cleanAddress(b.address);
  l.status = "needs_review"; l.reason = "new"; l.precheckedFor = null;
  await l.save();
  res.json({ ok: true });
}));

router.get("/:id", authenticate, perUser(60), h(async (req, res) => {
  const l = await mine(req);
  res.json({ ok: true, list: view(l), review: await review(l.toObject()) });
}));

// The buyer has looked at the review and agrees. Prices shown become the approved prices.
router.post("/:id/confirm", authenticate.strict, perUser(10), h(async (req, res) => {
  const l = await mine(req);
  const b = req.body || {};
  if (b.consent !== true) throw E("CONSENT_REQUIRED");
  if (!b.expect || typeof b.expect !== "object") throw E("REVIEW_REQUIRED");
  if (!l.deliveryAt || !l.address?.county) throw E("NO_SCHEDULE");
  if (Array.isArray(b.dropItemIds)) l.items = l.items.filter((i) => !b.dropItemIds.includes(String(i._id)));
  if (!l.items.length) throw E("NOTHING_ORDERABLE");

  const next = rollForward(l);
  if (!next) throw E("DELIVERY_TOO_SOON");
  l.deliveryAt = next;

  const rv = await review(l.toObject());
  if (!rv.rows.some((r) => r.status === "ok")) throw E("NOTHING_ORDERABLE");
  for (const r of rv.rows) {
    if (r.unitPrice == null) continue;
    const seen = Number(b.expect[r.itemId]);
    if (Number.isFinite(seen) && r.unitPrice > seen) throw E("PRICE_CHANGED", 409); // it moved since the buyer looked
    l.items.id(r.itemId).approvedPrice = r.unitPrice;
  }
  l.status = "active"; l.reason = ""; l.consentAt = new Date(); l.precheckedFor = null; l.leaseUntil = null;
  await l.save();
  res.json({ ok: true });
}));

router.post("/:id/pause", authenticate, perUser(30), h(async (req, res) => {
  const l = await mine(req);
  if (!["active", "needs_review"].includes(l.status)) throw E("CANNOT_PAUSE", 409);
  l.status = "paused"; await l.save();
  res.json({ ok: true });
}));
router.post("/:id/resume", authenticate, perUser(30), h(async (req, res) => {
  const l = await mine(req);
  if (l.status !== "paused" || !l.deliveryAt) throw E("CANNOT_RESUME", 409);
  l.status = "needs_review"; l.reason = "resume"; await l.save(); // the buyer verifies again before anything is ordered
  res.json({ ok: true });
}));

router.post("/:id/block", authenticate, perUser(30), h(async (req, res) => {
  const l = await mine(req);
  if (!isId(String(req.body?.sellerId))) throw E("INVALID_ID");
  if (!l.blockedSellers.some((s) => String(s) === req.body.sellerId)) l.blockedSellers.push(req.body.sellerId);
  await l.save();
  res.json({ ok: true });
}));
router.delete("/:id/block/:sellerId", authenticate, perUser(30), h(async (req, res) => {
  const l = await mine(req);
  l.blockedSellers = l.blockedSellers.filter((s) => String(s) !== req.params.sellerId);
  await l.save();
  res.json({ ok: true });
}));

router.delete("/:id", authenticate, perUser(20), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  await ShoppingList.deleteOne({ _id: req.params.id, buyerId: req.user._id }); // orders already placed are not affected
  res.json({ ok: true });
}));

module.exports = router;
