const express = require("express");
const mongoose = require("mongoose");
const apiKey = require("../../middleware/apiKey");
const { perKey } = require("../../middleware/limits");
const Product = require("../../models/Product");
const Sale = require("../../models/Sale");
const Branch = require("../../models/Branch");
const BranchStock = require("../../models/BranchStock");

const router = express.Router();
const EAT = 3 * 3600 * 1000, DAY = 86400000;
router.use(apiKey, perKey(60));
router.use((req, res, next) => (req.method === "GET" ? next() : res.status(405).json({ error: "READ_ONLY_API" })));

const page = (req) => Math.max(1, Math.min(1000, parseInt(req.query.page, 10) || 1));
const day = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 ? new Date(d.getTime() - EAT) : null;
};
const h = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { console.error("❌ api v1:", e.stack || e.message); res.status(500).json({ error: "INTERNAL_SERVER_ERROR" }); } };

router.get("/products", h(async (req, res) => {
  const p = page(req);
  const rows = await Product.find({ sellerId: req.apiOwnerId }).sort({ _id: 1 }).skip((p - 1) * 100).limit(101)
    .select("name productCode barcode price quantity category status updatedAt").lean();
  res.json({ ok: true, page: p, hasMore: rows.length > 100, products: rows.slice(0, 100).map((r) => ({ id: r._id, name: r.name, sku: r.productCode, barcode: r.barcode || null, price: r.price, quantityMainBranch: r.quantity, category: r.category, status: r.status, updatedAt: r.updatedAt })) });
}));

router.get("/branches", h(async (req, res) => {
  const rows = await Branch.find({ ownerId: req.apiOwnerId, archived: false }).select("name isMain").lean();
  res.json({ ok: true, branches: rows.map((b) => ({ id: b._id, name: b.name, isMain: b.isMain })) });
}));

router.get("/branches/:id/stock", h(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "INVALID_ID" });
  const b = await Branch.findOne({ _id: req.params.id, ownerId: req.apiOwnerId }).select("isMain").lean();
  if (!b) return res.status(404).json({ error: "BRANCH_NOT_FOUND" });
  const p = page(req);
  if (b.isMain) {
    const rows = await Product.find({ sellerId: req.apiOwnerId }).sort({ _id: 1 }).skip((p - 1) * 100).limit(101).select("quantity").lean();
    return res.json({ ok: true, page: p, hasMore: rows.length > 100, stock: rows.slice(0, 100).map((r) => ({ productId: r._id, quantity: r.quantity })) });
  }
  const rows = await BranchStock.find({ branchId: b._id }).sort({ _id: 1 }).skip((p - 1) * 100).limit(101).select("productId quantity").lean();
  res.json({ ok: true, page: p, hasMore: rows.length > 100, stock: rows.slice(0, 100).map((r) => ({ productId: r.productId, quantity: r.quantity })) });
}));

// from and to are Nairobi dates (YYYY-MM-DD), at most 31 days apart. Customer details are never included.
router.get("/sales", h(async (req, res) => {
  const from = day(req.query.from), toDay = day(req.query.to);
  if (!from || !toDay) return res.status(400).json({ error: "INVALID_DATE" });
  const to = new Date(toDay.getTime() + DAY);
  if (to <= from || to - from > 31 * DAY) return res.status(400).json({ error: "INVALID_RANGE" });
  const p = page(req);
  const rows = await Sale.find({ sellerId: req.apiOwnerId, createdAt: { $gte: from, $lt: to } }).sort({ createdAt: 1, _id: 1 }).skip((p - 1) * 100).limit(101)
    .select("receiptNo branchId lines total discount paymentMethod creditAmount voided createdAt").lean();
  res.json({ ok: true, page: p, hasMore: rows.length > 100, sales: rows.slice(0, 100).map((s) => ({
    receiptNo: s.receiptNo, branchId: s.branchId || null, at: s.createdAt, total: s.total, discount: s.discount, paymentMethod: s.paymentMethod, onCredit: s.creditAmount || 0, voided: s.voided,
    lines: s.lines.map((l) => ({ productId: l.productId, name: l.name, sku: l.sku, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.lineTotal })) })) });
}));

module.exports = router;
