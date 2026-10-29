const express = require("express");
const mongoose = require("mongoose");
const authenticate = require("../../middleware/authenticate");
const { perUser } = require("../../middleware/limits");
const Product = require("../../models/Product");
const StockMovement = require("../../models/StockMovement");
const { entitlementsFor } = require("../membership/entitlements");
const ProductCost = require("../../models/ProductCost");
const { entitlementsFor, requireFeature } = require("../membership/entitlements"); // extend the existing import



const router = express.Router();
const LOW = 10;
const member = (req, res, next) => (req.user?.accountCategory === "network" ? next() : res.status(403).json({ error: "MARKETER_ACCOUNT_REQUIRED" }));
const fail = (res, e, tag) => { console.error(`❌ ${tag}:`, e.stack || e.message); return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" }); };

router.get("/summary", authenticate, member, perUser(30), async (req, res) => {
  try {
    const ent = entitlementsFor(req.user);
    const [s] = await Product.aggregate([
      { $match: { sellerId: req.user._id } },
      { $group: {
        _id: null, total: { $sum: 1 },
        retailValue: { $sum: { $multiply: ["$price", "$quantity"] } },
        low: { $sum: { $cond: [{ $and: [{ $gt: ["$quantity", 0] }, { $lte: ["$quantity", LOW] }] }, 1, 0] } },
        out: { $sum: { $cond: [{ $lte: ["$quantity", 0] }, 1, 0] } },
      } },
    ]);
    res.json({ ok: true, total: s?.total || 0, retailValue: s?.retailValue || 0, low: s?.low || 0, out: s?.out || 0,
      limit: ent.limits.products, readOnly: ent.readOnly, plan: ent.name });
  } catch (e) { fail(res, e, "inventory summary"); }
});

router.get("/movements", authenticate, member, perUser(60), async (req, res) => {
  try {
    const q = { sellerId: req.user._id };
    if (req.query.productId !== undefined) {
      if (!mongoose.isValidObjectId(req.query.productId)) return res.status(400).json({ error: "INVALID_ID" });
      q.productId = req.query.productId;
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const rows = await StockMovement.find(q).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 50).limit(51)
      .select("productName type delta balanceAfter note createdAt").lean();
    res.json({ ok: true, hasMore: rows.length > 50, movements: rows.slice(0, 50) });
  } catch (e) { fail(res, e, "inventory movements"); }
});

// Spreadsheet programs run text starting with = + - @ as formulas, so those cells are neutralised
const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };

router.get("/export.csv", authenticate, member, perUser(5), async (req, res) => {
  try {
    res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sokodigi-inventory-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" });
    res.write("\ufeffSKU,Name,Category,Price,In stock,Delivery fee,Status\n");
    for await (const p of Product.find({ sellerId: req.user._id }).sort({ createdAt: 1 }).lean().cursor()) {
      res.write([p.productCode, p.name, p.category, p.price, p.quantity, p.deliveryFee, p.status].map(cell).join(",") + "\n");
    }
    res.end();
  } catch (e) { if (!res.headersSent) return fail(res, e, "inventory export"); res.end(); }
});

router.get("/costs", authenticate, member, perUser(30), async (req, res) => {
  try {
    const rows = await ProductCost.find({ sellerId: req.user._id }).select("productId costPrice").lean();
    res.json({ ok: true, costs: Object.fromEntries(rows.map((r) => [String(r.productId), r.costPrice])) });
  } catch (e) { fail(res, e, "inventory costs"); }
});

// body: { costPrice: whole number | null }. Private: never returned by any public route.
router.put("/products/:id/cost", authenticate, member, requireFeature("pos"), perUser(60), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "INVALID_ID" });
    const c = req.body?.costPrice;
    if (c !== null && !(Number.isInteger(c) && c >= 0 && c <= 5000000)) return res.status(400).json({ error: "INVALID_COST" });
    if (!(await Product.exists({ _id: id, sellerId: req.user._id }))) return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    if (c === null) await ProductCost.deleteOne({ productId: id, sellerId: req.user._id });
    else await ProductCost.updateOne({ productId: id }, { $set: { costPrice: c }, $setOnInsert: { sellerId: req.user._id } }, { upsert: true });
    res.json({ ok: true });
  } catch (e) { fail(res, e, "set cost"); }
});

module.exports = router;
