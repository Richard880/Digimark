const express = require("express");
const mongoose = require("mongoose");
const authenticate = require("../../middleware/authenticate");
const { perUser } = require("../../middleware/limits");
const Supplier = require("../../models/Supplier");
const PurchaseOrder = require("../../models/PurchaseOrder");
const Product = require("../../models/Product");
const ProductCost = require("../../models/ProductCost");
const Counter = require("../../models/Counter");
const { changeStock } = require("../../services/stockLedger");
const { requireFeature } = require("../membership/entitlements");

const router = express.Router();
const MAX_QTY = 100000, MAX_PRICE = 5000000, LOW = 10;
const OPEN = ["draft", "ordered", "partial"];

const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const isId = (v) => typeof v === "string" && mongoose.isValidObjectId(v);
const E = (message, http = 400, extra) => Object.assign(new Error(message), { http, extra });
const txt = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max) : "");
const member = (req, res, next) => (req.user?.accountCategory === "network" ? next() : res.status(403).json({ error: "MARKETER_ACCOUNT_REQUIRED" }));
const h = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.message, ...(e.extra || {}) });
    console.error("❌ supply:", e.stack || e.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};
const phoneOf = (raw) => {
  const p = String(raw || "").replace(/[\s+-]/g, "");
  if (/^0[17]\d{8}$/.test(p)) return `254${p.slice(1)}`;
  return /^254[17]\d{8}$/.test(p) ? p : null;
};
const dateOf = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const d = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00+03:00`) : null;
  if (!d || Number.isNaN(d.getTime())) throw E("INVALID_DATE");
  return d;
};

async function buildLines(me, raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 50) throw E("INVALID_LINES");
  const seen = new Set();
  for (const l of raw) {
    if (!isId(l?.productId) || !int(l.quantity, 1, MAX_QTY) || !int(l.unitCost, 0, MAX_PRICE)) throw E("INVALID_LINES");
    if (seen.has(l.productId)) throw E("DUPLICATE_PRODUCT");
    seen.add(l.productId);
  }
  const prods = await Product.find({ _id: { $in: [...seen] }, sellerId: me }).select("name productCode barcode").lean();
  if (prods.length !== seen.size) throw E("PRODUCT_NOT_FOUND", 404);
  const by = new Map(prods.map((p) => [String(p._id), p]));
  return raw.map((l) => {
    const p = by.get(l.productId);
    return { productId: p._id, name: p.name, sku: p.productCode || "", barcode: p.barcode || "", qtyOrdered: l.quantity, qtyReceived: 0, unitCost: l.unitCost };
  });
}
const totalOf = (lines) => lines.reduce((t, l) => t + l.qtyOrdered * l.unitCost, 0);

/* ───────── Low stock → suggested restock ───────── */
router.get("/low-stock", authenticate, member, perUser(30), h(async (req, res) => {
  const rows = await Product.find({ sellerId: req.user._id, quantity: { $lte: LOW } }).sort({ quantity: 1 }).limit(100).select("name quantity productCode").lean();
  const costs = new Map((await ProductCost.find({ sellerId: req.user._id, productId: { $in: rows.map((r) => r._id) } }).select("productId costPrice").lean()).map((c) => [String(c.productId), c.costPrice]));
  res.json({ ok: true, products: rows.map((r) => ({ ...r, unitCost: costs.get(String(r._id)) ?? null })) });
}));

/* ───────── Suppliers ───────── */
router.get("/suppliers", authenticate, member, perUser(60), h(async (req, res) => {
  const rows = await Supplier.find({ sellerId: req.user._id, archived: false }).sort({ name: 1 }).limit(200).select("name phone note").lean();
  res.json({ ok: true, suppliers: rows });
}));

router.post("/suppliers", authenticate, member, requireFeature("suppliers"), perUser(30), h(async (req, res) => {
  const b = req.body || {};
  const name = txt(b.name, 80);
  if (!name) throw E("INVALID_NAME");
  let phone = null;
  if (b.phone) { phone = phoneOf(b.phone); if (!phone) throw E("INVALID_PHONE"); }
  if ((await Supplier.countDocuments({ sellerId: req.user._id, archived: false })) >= 200) throw E("SUPPLIER_LIMIT", 403);
  const s = await Supplier.create({ sellerId: req.user._id, name, phone, note: txt(b.note, 200) });
  res.status(201).json({ ok: true, supplier: { _id: s._id, name: s.name, phone: s.phone, note: s.note } });
}));

router.patch("/suppliers/:id", authenticate, member, requireFeature("suppliers"), perUser(60), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const me = req.user._id, b = req.body || {}, set = {};
  if (b.name !== undefined) { const n = txt(b.name, 80); if (!n) throw E("INVALID_NAME"); set.name = n; }
  if (b.phone !== undefined) { set.phone = b.phone ? phoneOf(b.phone) : null; if (b.phone && !set.phone) throw E("INVALID_PHONE"); }
  if (b.note !== undefined) set.note = txt(b.note, 200);
  if (b.archived !== undefined) {
    if (typeof b.archived !== "boolean") throw E("INVALID_ACTION");
    if (b.archived && (await PurchaseOrder.exists({ sellerId: me, supplierId: req.params.id, status: { $in: OPEN } }))) throw E("HAS_OPEN_ORDERS", 409);
    set.archived = b.archived;
  }
  if (!Object.keys(set).length) throw E("NOTHING_TO_UPDATE");
  const s = await Supplier.findOneAndUpdate({ _id: req.params.id, sellerId: me }, { $set: set }, { new: true });
  if (!s) throw E("SUPPLIER_NOT_FOUND", 404);
  res.json({ ok: true, supplier: { _id: s._id, name: s.name, phone: s.phone, note: s.note } });
}));

/* ───────── Restock orders ───────── */
router.get("/orders", authenticate, member, perUser(60), h(async (req, res) => {
  const f = { sellerId: req.user._id };
  if (["draft", "ordered", "partial", "received", "closed", "cancelled"].includes(req.query.status)) f.status = req.query.status;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const rows = await PurchaseOrder.find(f).sort({ createdAt: -1 }).skip((page - 1) * 30).limit(31).select("-receipts -__v").lean();
  res.json({ ok: true, hasMore: rows.length > 30, orders: rows.slice(0, 30) });
}));

router.get("/orders/:id", authenticate, member, perUser(60), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const o = await PurchaseOrder.findOne({ _id: req.params.id, sellerId: req.user._id }).select("-receipts -__v").lean();
  if (!o) throw E("ORDER_NOT_FOUND", 404);
  res.json({ ok: true, order: o });
}));

async function supplierFor(me, id) {
  if (!isId(id)) throw E("INVALID_ID");
  const s = await Supplier.findOne({ _id: id, sellerId: me, archived: false }).lean();
  if (!s) throw E("SUPPLIER_NOT_FOUND", 404);
  return s;
}

router.post("/orders", authenticate, member, requireFeature("suppliers"), perUser(30), h(async (req, res) => {
  const me = req.user._id, b = req.body || {};
  const sup = await supplierFor(me, b.supplierId);
  const lines = await buildLines(me, b.lines);
  const ctr = await Counter.findOneAndUpdate({ _id: `po:${me}` }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  const place = b.place === true;
  const o = await PurchaseOrder.create({
    sellerId: me, supplierId: sup._id, supplierName: sup.name, supplierPhone: sup.phone, poNumber: `PO-${String(ctr.seq).padStart(4, "0")}`,
    status: place ? "ordered" : "draft", lines, total: totalOf(lines), expectedAt: dateOf(b.expectedAt), note: txt(b.note, 200), ...(place ? { orderedAt: new Date() } : {}),
  });
  res.status(201).json({ ok: true, order: o.toObject() });
}));

router.put("/orders/:id", authenticate, member, requireFeature("suppliers"), perUser(30), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const me = req.user._id, b = req.body || {};
  const sup = await supplierFor(me, b.supplierId);
  const lines = await buildLines(me, b.lines);
  const o = await PurchaseOrder.findOneAndUpdate(
    { _id: req.params.id, sellerId: me, status: "draft" },
    { $set: { supplierId: sup._id, supplierName: sup.name, supplierPhone: sup.phone, lines, total: totalOf(lines), expectedAt: dateOf(b.expectedAt), note: txt(b.note, 200) } },
    { new: true }
  );
  if (!o) throw E((await PurchaseOrder.exists({ _id: req.params.id, sellerId: me })) ? "NOT_EDITABLE" : "ORDER_NOT_FOUND", (await PurchaseOrder.exists({ _id: req.params.id, sellerId: me })) ? 409 : 404);
  res.json({ ok: true, order: o.toObject() });
}));

// One-step status changes. The status in the filter is the lock.
const move = (path, from, to, extra = {}) => router.post(`/orders/:id/${path}`, authenticate.strict, member, requireFeature("suppliers"), perUser(30), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const o = await PurchaseOrder.findOneAndUpdate({ _id: req.params.id, sellerId: req.user._id, status: { $in: from } }, { $set: { status: to, ...extra } }, { new: true }).select("status");
  if (!o) throw E((await PurchaseOrder.exists({ _id: req.params.id, sellerId: req.user._id })) ? "INVALID_STATUS" : "ORDER_NOT_FOUND", (await PurchaseOrder.exists({ _id: req.params.id, sellerId: req.user._id })) ? 409 : 404);
  res.json({ ok: true, status: o.status });
}));
move("place", ["draft"], "ordered", { orderedAt: new Date() });
move("cancel", ["draft", "ordered"], "cancelled");      // nothing has been received yet in these states
move("close", ["partial"], "closed", { closedAt: new Date() }); // accept what arrived and stop waiting for the rest

// Receive stock. clientRef makes a retry or double-tap harmless.
router.post("/orders/:id/receive", authenticate.strict, member, requireFeature("suppliers"), perUser(30), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const me = req.user._id, b = req.body || {};
  const clientRef = typeof b.clientRef === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(b.clientRef) ? b.clientRef : null;
  if (!clientRef) throw E("CLIENT_REF_REQUIRED");
  if (!Array.isArray(b.lines) || b.lines.length < 1 || b.lines.length > 50) throw E("INVALID_LINES");
  const got = new Map();
  for (const l of b.lines) {
    if (!isId(l?.productId) || !int(l.quantity, 1, MAX_QTY) || got.has(l.productId)) throw E("INVALID_LINES");
    got.set(l.productId, l.quantity);
  }

  const result = await mongoose.connection.transaction(async (session) => {
    const po = await PurchaseOrder.findOne({ _id: req.params.id, sellerId: me }).session(session);
    if (!po) throw E("ORDER_NOT_FOUND", 404);
    if (po.receipts.some((r) => r.ref === clientRef)) return { po, replay: true };
    if (!["ordered", "partial"].includes(po.status)) throw E("NOT_RECEIVABLE", 409);
    for (const pid of got.keys()) if (!po.lines.some((l) => String(l.productId) === pid)) throw E("LINE_NOT_FOUND");

    for (const line of po.lines) {
      const q = got.get(String(line.productId));
      if (!q) continue;
      if (q > line.qtyOrdered - line.qtyReceived) throw E("OVER_RECEIVING", 409, { product: line.name });
      const ok = await changeStock(session, { productId: line.productId, sellerId: me, delta: q, type: "restock", ref: `po:${po._id}:${clientRef}:${line.productId}`, note: `${po.poNumber} from ${po.supplierName}`, actorId: me, max: MAX_QTY });
      if (!ok) throw E("STOCK_CHANGE_NOT_POSSIBLE", 409, { product: line.name });
      line.qtyReceived += q;
      if (b.updateCost === true) await ProductCost.updateOne({ productId: line.productId }, { $set: { costPrice: line.unitCost }, $setOnInsert: { sellerId: me } }, { upsert: true, session });
    }
    po.receipts.push({ ref: clientRef, at: new Date(), lines: [...got].map(([productId, quantity]) => ({ productId, quantity })) });
    const done = po.lines.every((l) => l.qtyReceived >= l.qtyOrdered);
    po.status = done ? "received" : "partial";
    if (done) po.receivedAt = new Date();
    await po.save({ session });
    return { po, replay: false };
  });
  const o = result.po.toObject();
  delete o.receipts;
  res.status(result.replay ? 200 : 201).json({ ok: true, ...(result.replay ? { replay: true } : {}), order: o });
}));

module.exports = router;
