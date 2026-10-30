const express = require("express");
const mongoose = require("mongoose");
const authenticate = require("../../middleware/authenticate");
const { perUser } = require("../../middleware/limits");
const Product = require("../../models/Product");
const ProductCost = require("../../models/ProductCost");
const Sale = require("../../models/Sale");
const Counter = require("../../models/Counter");
const CashClose = require("../../models/CashClose");
const Order = require("../../models/Order");
const { changeStock } = require("../../services/stockLedger");
const { requireFeature } = require("../membership/entitlements");
const Customer = require("../../models/Customer");
const CustomerEntry = require("../../models/CustomerEntry");
const { requireFeature, entitlementsFor } = require("../membership/entitlements"); // extend the existing import
const DAY = 86400000;

const router = express.Router();
const MAX_QTY = 100000, MAX_PRICE = 5000000, EAT = 3 * 3600 * 1000;

const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const isId = (v) => typeof v === "string" && mongoose.isValidObjectId(v);
const E = (message, http = 400, extra) => Object.assign(new Error(message), { http, extra });
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const txt = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max) : "");
const member = (req, res, next) => (req.user?.accountCategory === "network" ? next() : res.status(403).json({ error: "MARKETER_ACCOUNT_REQUIRED" }));
const h = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.message, ...(e.extra || {}) });
    console.error("❌ pos:", e.stack || e.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// A trading day in Nairobi time (UTC+3)
function dayRange(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof s === "string" ? s : "");
  const now = new Date(Date.now() + EAT);
  const [y, mo, d] = m ? [+m[1], +m[2], +m[3]] : [now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) throw E("INVALID_DATE");
  const start = new Date(probe.getTime() - EAT);
  return { start, end: new Date(start.getTime() + 86400000), label: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

/** Products for the sell screen (the seller's own, listed or not) */
router.get("/products", authenticate, member, perUser(120), h(async (req, res) => {
  const q = txt(req.query.q, 40);
  const filter = { sellerId: req.user._id };
  if (q) { const rx = new RegExp(esc(q), "i"); filter.$or = [{ name: rx }, { productCode: rx }]; }
  const products = await Product.find(filter).sort(q ? { name: 1 } : { updatedAt: -1 }).limit(60)
    .select("name price quantity productCode imageUrl").lean();
  res.json({ ok: true, products });
}));

/** Record a sale. A retry with the same clientRef returns the original sale. */
async function recordSale(me, b, { offline = false, ent }) {
  const clientRef = typeof b.clientRef === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(b.clientRef) ? b.clientRef : null;
  if (!clientRef) throw E("CLIENT_REF_REQUIRED");
  const prior = await Sale.findOne({ sellerId: me, clientRef }).lean();
  if (prior) return { sale: prior, replay: true };

  if (!Array.isArray(b.lines) || b.lines.length < 1 || b.lines.length > 50) throw E("INVALID_LINES");
  const want = new Map();
  for (const l of b.lines) {
    if (!isId(l?.productId) || !int(l.quantity, 1, MAX_QTY)) throw E("INVALID_LINES");
    if (l.unitPrice !== undefined && !int(l.unitPrice, 1, MAX_PRICE)) throw E("INVALID_PRICE");
    const cur = want.get(l.productId);
    if (cur) cur.quantity += l.quantity; else want.set(l.productId, { quantity: l.quantity, unitPrice: l.unitPrice });
  }
  const discount = b.discount === undefined ? 0 : b.discount;
  if (!int(discount, 0, MAX_PRICE * 50)) throw E("INVALID_DISCOUNT");
  const method = b.paymentMethod;
  if (!["cash", "mpesa", "credit"].includes(method)) throw E("INVALID_PAYMENT");
  const mpesaRef = typeof b.mpesaRef === "string" ? b.mpesaRef.trim().toUpperCase() : "";
  if (mpesaRef && !/^[A-Z0-9]{10}$/.test(mpesaRef)) throw E("INVALID_MPESA_REF");

  let wantCredit = 0; // -1 means "all of it"
  if (method === "credit") wantCredit = -1;
  else if (b.creditAmount !== undefined) { if (!int(b.creditAmount, 1, MAX_PRICE * 50)) throw E("INVALID_CREDIT"); wantCredit = b.creditAmount; }
  if (wantCredit !== 0) {
    if (!ent.features.creditSales) throw E("PLAN_UPGRADE_REQUIRED", 403, { feature: "creditSales" });
    if (!isId(b.customerId)) throw E("CREDIT_CUSTOMER_REQUIRED");
  }

  // Offline sales keep the time they were made, within the last 14 days
  let soldAt = new Date();
  if (offline && typeof b.soldAt === "string" && Number.isFinite(Date.parse(b.soldAt))) {
    soldAt = new Date(Math.min(Date.now(), Math.max(Date.now() - 14 * DAY, Date.parse(b.soldAt))));
  }

  try {
    const sale = await mongoose.connection.transaction(async (session) => {
      const ids = [...want.keys()];
      const prods = await Product.find({ _id: { $in: ids }, sellerId: me }).select("name price productCode").session(session).lean();
      if (prods.length !== ids.length) throw E("PRODUCT_NOT_FOUND", 404);
      const costs = new Map((await ProductCost.find({ productId: { $in: ids }, sellerId: me }).select("productId costPrice").session(session).lean())
        .map((c) => [String(c.productId), c.costPrice]));

      const lines = prods.map((p) => {
        const w = want.get(String(p._id));
        const unitPrice = w.unitPrice ?? p.price;
        return { productId: p._id, name: p.name, sku: p.productCode || "", quantity: w.quantity, unitPrice,
          unitCost: costs.has(String(p._id)) ? costs.get(String(p._id)) : null, lineTotal: unitPrice * w.quantity, shortfall: 0 };
      });
      const subtotal = lines.reduce((t, l) => t + l.lineTotal, 0);
      if (discount >= subtotal) throw E("INVALID_DISCOUNT");
      const total = subtotal - discount;
      let rem = discount;
      for (const l of lines) { const share = Math.floor((discount * l.lineTotal) / subtotal); l.lineTotal -= share; rem -= share; }
      while (rem > 0) for (const l of lines) if (rem > 0 && l.lineTotal > 0) { l.lineTotal--; rem--; }

      const creditAmount = wantCredit === -1 ? total : wantCredit;
      if (creditAmount > total || (method !== "credit" && creditAmount >= total)) throw E("INVALID_CREDIT");
      const paidNow = total - creditAmount;
      let tendered, change;
      if (method === "cash") {
        tendered = b.amountTendered === undefined ? paidNow : b.amountTendered;
        if (!int(tendered, paidNow, MAX_PRICE * 50)) throw E("INSUFFICIENT_TENDER");
        change = tendered - paidNow;
      }

      // Credit: add to the customer's balance atomically. Online sales enforce the limit; offline ones are flagged.
      let customer = null, overLimit = false;
      if (creditAmount > 0) {
        const limitOk = offline ? {} : { $or: [{ creditLimit: null }, { $expr: { $lte: [{ $add: ["$balance", creditAmount] }, "$creditLimit"] } }] };
        customer = await Customer.findOneAndUpdate(
          { _id: b.customerId, sellerId: me, archived: false, ...limitOk },
          { $inc: { balance: creditAmount }, $set: { lastCreditAt: soldAt } }, { new: true, session });
        if (!customer) throw E((await Customer.exists({ _id: b.customerId, sellerId: me, archived: false }).session(session)) ? "CREDIT_LIMIT_EXCEEDED" : "CUSTOMER_NOT_FOUND", 409);
        overLimit = customer.creditLimit != null && customer.balance > customer.creditLimit;
      }

      const saleId = new mongoose.Types.ObjectId();
      const ctr = await Counter.findOneAndUpdate({ _id: `receipt:${me}` }, { $inc: { seq: 1 } }, { upsert: true, new: true, session });
      const receiptNo = `R-${String(ctr.seq).padStart(6, "0")}`;

      for (const l of lines) {
        let take = l.quantity;
        if (offline) { // the goods are already gone: record the sale, take what stock there is, and flag the rest
          const cur = await Product.findOne({ _id: l.productId, sellerId: me }).select("quantity").session(session).lean();
          take = Math.min(l.quantity, Math.max(0, cur?.quantity || 0));
          l.shortfall = l.quantity - take;
        }
        if (take > 0) {
          const ok = await changeStock(session, { productId: l.productId, sellerId: me, delta: -take, type: "sale_pos", ref: `pos:${saleId}:${l.productId}`, note: `Receipt ${receiptNo}`, actorId: me });
          if (!ok) throw E("INSUFFICIENT_STOCK", 409, { product: l.name });
        }
      }

      const [created] = await Sale.create([{
        _id: saleId, sellerId: me, cashierId: me, receiptNo, clientRef, lines, subtotal, discount, total,
        paymentMethod: method === "credit" ? "credit" : method, amountTendered: tendered, change, mpesaRef,
        creditAmount, customerId: customer?._id || null, overLimit,
        customerName: customer ? customer.name : txt(b.customerName, 80), note: txt(b.note, 200),
        offline, ...(offline ? { syncedAt: new Date() } : {}), createdAt: soldAt,
      }], { session });

      if (customer) {
        await CustomerEntry.create([{ sellerId: me, customerId: customer._id, type: "credit_sale", amount: creditAmount, balanceAfter: customer.balance, saleId, note: `Receipt ${receiptNo}`, ref: `sale:${saleId}` }], { session });
      }
      return created.toObject();
    });
    return { sale };
  } catch (e) {
    if (e.code === 11000) { // the same request arrived twice at once
      const again = await Sale.findOne({ sellerId: me, clientRef }).lean();
      if (again) return { sale: again, replay: true };
    }
    throw e;
  }
}

router.post("/sales", authenticate, member, requireFeature("pos"), perUser(60), h(async (req, res) => {
  const r = await recordSale(req.user._id, req.body || {}, { offline: false, ent: req.ent });
  res.status(r.replay ? 200 : 201).json({ ok: true, ...(r.replay ? { replay: true } : {}), sale: r.sale });
}));

// Sales made offline. Each is processed on its own, so one bad sale never blocks the others.
router.post("/sales/sync", authenticate, member, requireFeature("pos"), perUser(30), h(async (req, res) => {
  const list = Array.isArray(req.body?.sales) ? req.body.sales.slice(0, 20) : null;
  if (!list?.length) throw E("INVALID_LINES");
  const ent = entitlementsFor(req.user);
  const results = [];
  for (const s of list) {
    const clientRef = typeof s?.clientRef === "string" ? s.clientRef : null;
    try {
      const r = await recordSale(req.user._id, s || {}, { offline: true, ent });
      results.push({ clientRef, ok: true, replay: !!r.replay, receiptNo: r.sale.receiptNo,
        shortfall: r.sale.lines.some((l) => l.shortfall > 0), overLimit: !!r.sale.overLimit });
    } catch (e) {
      if (e.http) results.push({ clientRef, ok: false, error: e.message, product: e.extra?.product });
      else { console.error("❌ pos sync:", e.stack || e.message); results.push({ clientRef, ok: false, error: "SERVER_ERROR", retry: true }); }
    }
  }
  res.json({ ok: true, results });
}));

// The whole catalogue for the device: search works offline too
router.get("/catalog", authenticate, member, perUser(20), h(async (req, res) => {
  const rows = await Product.find({ sellerId: req.user._id }).sort({ name: 1 }).limit(3001).select("name price quantity productCode imageUrl").lean();
  res.json({ ok: true, truncated: rows.length > 3000, products: rows.slice(0, 3000) });
}));
/** Sales for one day (default today) */
router.get("/sales", authenticate, member, perUser(60), h(async (req, res) => {
  const { start, end, label } = dayRange(req.query.date);
  const sales = await Sale.find({ sellerId: req.user._id, createdAt: { $gte: start, $lt: end } }).sort({ createdAt: -1 }).limit(200).select("-__v").lean();
  res.json({ ok: true, date: label, sales });
}));

/** Undo a sale within 24 hours. Stock goes back through the ledger. */
router.post("/sales/:id/void", authenticate.strict, member, requireFeature("pos"), perUser(20), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const sale = await Sale.findOne({ _id: req.params.id, sellerId: req.user._id }).lean();
  if (!sale) throw E("SALE_NOT_FOUND", 404);
  if (sale.voided) throw E("ALREADY_VOIDED", 409);
  if (Date.now() - new Date(sale.createdAt).getTime() > 24 * 3600 * 1000) throw E("VOID_WINDOW_PASSED", 409);
  await mongoose.connection.transaction(async (session) => {
    const f = await Sale.findOneAndUpdate({ _id: sale._id, voided: false }, { $set: { voided: true, voidedAt: new Date() } }, { session });
    if (!f) throw E("ALREADY_VOIDED", 409);
   for (const l of sale.lines) {
  const back = l.quantity - (l.shortfall || 0); // only what was actually taken from stock
  if (back > 0) await changeStock(session, { productId: l.productId, delta: back, type: "void", ref: `void:${sale._id}:${l.productId}`, note: `Voided ${sale.receiptNo}`, actorId: req.user._id });
}
if (sale.creditAmount > 0 && sale.customerId) {
  const c = await Customer.findOneAndUpdate({ _id: sale.customerId, sellerId: req.user._id }, { $inc: { balance: -sale.creditAmount } }, { new: true, session });
  if (c) await CustomerEntry.create([{ sellerId: req.user._id, customerId: c._id, type: "void_sale", amount: -sale.creditAmount, balanceAfter: c.balance, saleId: sale._id, note: `Voided ${sale.receiptNo}`, ref: `void:${sale._id}` }], { session });
}
  });
  res.json({ ok: true });
}));

/** Daily report */
router.get("/report", authenticate, member, perUser(30), h(async (req, res) => {
  const { start, end, label } = dayRange(req.query.date);
  const match = { sellerId: req.user._id, createdAt: { $gte: start, $lt: end } };
  const live = { ...match, voided: false };
  const [tot, pay, items, voidedCount, online, close] = await Promise.all([
    Sale.aggregate([{ $match: live }, { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: "$total" }, discount: { $sum: "$discount" } } }]),
    Sale.aggregate([{ $match: live }, { $group: { _id: "$paymentMethod", count: { $sum: 1 }, total: { $sum: "$total" } } }]),
    Sale.aggregate([
      { $match: live }, { $unwind: "$lines" },
      { $group: {
        _id: "$lines.productId", name: { $first: "$lines.name" }, qty: { $sum: "$lines.quantity" }, revenue: { $sum: "$lines.lineTotal" },
        cost: { $sum: { $cond: [{ $ne: ["$lines.unitCost", null] }, { $multiply: ["$lines.unitCost", "$lines.quantity"] }, 0] } },
        costedRevenue: { $sum: { $cond: [{ $ne: ["$lines.unitCost", null] }, "$lines.lineTotal", 0] } },
      } },
      { $sort: { revenue: -1 } }, { $limit: 100 },
    ]),
    Sale.countDocuments({ ...match, voided: true }),
    Order.aggregate([{ $match: { sellerId: req.user._id, orderStatus: "DELIVERED", deliveredAt: { $gte: start, $lt: end } } },
      { $group: { _id: null, count: { $sum: 1 }, received: { $sum: "$financials.totalWholesaleToShop" } } }]),
    CashClose.findOne({ sellerId: req.user._id, date: label }).lean(),
  ]);
  const by = Object.fromEntries(pay.map((p) => [p._id, { count: p.count, total: p.total }]));
  const costedRevenue = items.reduce((t, i) => t + i.costedRevenue, 0);
  const cost = items.reduce((t, i) => t + i.cost, 0);
  const revenue = tot[0]?.revenue || 0;
  res.json({
    ok: true, date: label,
    sales: { count: tot[0]?.count || 0, revenue, discount: tot[0]?.discount || 0 },
    byPayment: { cash: by.cash || { count: 0, total: 0 }, mpesa: by.mpesa || { count: 0, total: 0 } },
    profit: { value: costedRevenue - cost, costedRevenue, unknownCostRevenue: revenue - costedRevenue },
    items: items.map((i) => ({ productId: i._id, name: i.name, qty: i.qty, revenue: i.revenue, profit: i.costedRevenue ? i.costedRevenue - i.cost : null })),
    online: { count: online[0]?.count || 0, received: online[0]?.received || 0 },
    voidedCount, close,
  });
}));

/** Close the day: compare the cash you counted with what the sales say you should have */
router.post("/close", authenticate.strict, member, requireFeature("pos"), perUser(10), h(async (req, res) => {
  const { start, end, label } = dayRange(req.body?.date);
  if (start.getTime() > Date.now()) throw E("INVALID_DATE");
  const counted = req.body?.countedCash;
  if (!int(counted, 0, MAX_PRICE * 50)) throw E("INVALID_AMOUNT");
  const cash = await Sale.aggregate([{ $match: { sellerId: req.user._id, createdAt: { $gte: start, $lt: end }, voided: false, paymentMethod: "cash" } }, { $group: { _id: null, total: { $sum: "$total" } } }]);
  const expected = cash[0]?.total || 0;
  try {
    const c = await CashClose.create({ sellerId: req.user._id, date: label, expectedCash: expected, countedCash: counted, difference: counted - expected, note: txt(req.body?.note, 200) });
    res.status(201).json({ ok: true, close: c.toObject() });
  } catch (e) { if (e.code === 11000) throw E("ALREADY_CLOSED", 409); throw e; }
}));

module.exports = router;
