const express = require("express");
const mongoose = require("mongoose");
const authenticate = require("../../middleware/authenticate");
const { perUser } = require("../../middleware/limits");
const { shop, can, has, resolveBranch, branchScope, E } = require("../../middleware/shop");
const Product = require("../../models/Product");
const ProductCost = require("../../models/ProductCost");
const Sale = require("../../models/Sale");
const Counter = require("../../models/Counter");
const CashClose = require("../../models/CashClose");
const Order = require("../../models/Order");
const Customer = require("../../models/Customer");
const CustomerEntry = require("../../models/CustomerEntry");
const BranchStock = require("../../models/BranchStock");
const Branch = require("../../models/Branch");
const Terminal = require("../../models/Terminal");
const { changeBranchStock, ensureRows, currentQty } = require("../../services/branchStock");
const { requireFeature, entitlementsFor } = require("../membership/entitlements");
const { audit } = require("../../services/shopAudit");

const router = express.Router();
const MAX_QTY = 100000, MAX_PRICE = 5000000, EAT = 3 * 3600 * 1000, DAY = 86400000;

const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const isId = (v) => typeof v === "string" && mongoose.isValidObjectId(v);
const txt = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max) : "");
const h = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.message, ...(e.extra || {}) });
    console.error("❌ pos:", e.stack || e.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

function dayRange(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof s === "string" ? s : "");
  const now = new Date(Date.now() + EAT);
  const [y, mo, d] = m ? [+m[1], +m[2], +m[3]] : [now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) throw E("INVALID_DATE");
  const start = new Date(probe.getTime() - EAT);
  return { start, end: new Date(start.getTime() + DAY), label: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

// On plans with several devices, every sale must come from a registered device
async function checkTerminal(ownerId, terminalId, offline) {
  if (!isId(String(terminalId || ""))) throw E("TERMINAL_REQUIRED");
  const t = await Terminal.findOne({ _id: terminalId, ownerId }).select("status").lean();
  if (!t) throw E("TERMINAL_REQUIRED");
  if (t.status !== "active" && !offline) throw E("TERMINAL_REVOKED", 403); // a sale already made offline is still recorded
  Terminal.updateOne({ _id: t._id }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
  return t._id;
}

/** The whole catalogue for one branch, so the device can search offline */
router.get("/catalog", authenticate, shop, can("sell"), perUser(20), h(async (req, res) => {
  const branch = await resolveBranch(req, req.query.branchId);
  const rows = await Product.find({ sellerId: req.shop.ownerId }).sort({ name: 1 }).limit(3001).select("name price quantity productCode barcode imageUrl").lean();
  let products = rows.slice(0, 3000);
  if (!branch.isMain) {
    const bs = await BranchStock.find({ branchId: branch._id }).select("productId quantity").lean();
    const by = new Map(bs.map((b) => [String(b.productId), b.quantity]));
    products = products.map((p) => ({ ...p, quantity: by.get(String(p._id)) || 0 }));
  }
  res.json({ ok: true, branchId: branch._id, truncated: rows.length > 3000, products });
}));

async function recordSale(ctx, b, { offline, ent, canPrice }) {
  const { ownerId, cashierId, cashierName, branch, terminalId } = ctx;
  const clientRef = typeof b.clientRef === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(b.clientRef) ? b.clientRef : null;
  if (!clientRef) throw E("CLIENT_REF_REQUIRED");
  const prior = await Sale.findOne({ sellerId: ownerId, clientRef }).lean();
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

  let wantCredit = 0;
  if (method === "credit") wantCredit = -1;
  else if (b.creditAmount !== undefined) { if (!int(b.creditAmount, 1, MAX_PRICE * 50)) throw E("INVALID_CREDIT"); wantCredit = b.creditAmount; }
  if (wantCredit !== 0) {
    if (!ent.features.creditSales) throw E("PLAN_UPGRADE_REQUIRED", 403, { feature: "creditSales" });
    if (!isId(b.customerId)) throw E("CREDIT_CUSTOMER_REQUIRED");
  }

  let soldAt = new Date();
  if (offline && typeof b.soldAt === "string" && Number.isFinite(Date.parse(b.soldAt))) soldAt = new Date(Math.min(Date.now(), Math.max(Date.now() - 14 * DAY, Date.parse(b.soldAt))));

  let flagged = false;
  if (discount > 0 && !canPrice) { if (!offline) throw E("DISCOUNT_FORBIDDEN", 403); flagged = true; }
  if (!branch.isMain) await ensureRows(ownerId, branch._id, [...want.keys()]);

  try {
    const sale = await mongoose.connection.transaction(async (session) => {
      const ids = [...want.keys()];
      const prods = await Product.find({ _id: { $in: ids }, sellerId: ownerId }).select("name price productCode").session(session).lean();
      if (prods.length !== ids.length) throw E("PRODUCT_NOT_FOUND", 404);
      const costs = new Map((await ProductCost.find({ productId: { $in: ids }, sellerId: ownerId }).select("productId costPrice").session(session).lean()).map((c) => [String(c.productId), c.costPrice]));

      let priceFlag = false;
      const lines = prods.map((p) => {
        const w = want.get(String(p._id));
        const unitPrice = w.unitPrice ?? p.price;
        if (unitPrice !== p.price && !canPrice) { if (!offline) throw E("PRICE_OVERRIDE_FORBIDDEN", 403); priceFlag = true; }
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

      let customer = null, overLimit = false;
      if (creditAmount > 0) {
        const limitOk = offline ? {} : { $or: [{ creditLimit: null }, { $expr: { $lte: [{ $add: ["$balance", creditAmount] }, "$creditLimit"] } }] };
        customer = await Customer.findOneAndUpdate({ _id: b.customerId, sellerId: ownerId, archived: false, ...limitOk }, { $inc: { balance: creditAmount }, $set: { lastCreditAt: soldAt } }, { new: true, session });
        if (!customer) throw E((await Customer.exists({ _id: b.customerId, sellerId: ownerId, archived: false }).session(session)) ? "CREDIT_LIMIT_EXCEEDED" : "CUSTOMER_NOT_FOUND", 409);
        overLimit = customer.creditLimit != null && customer.balance > customer.creditLimit;
      }

      const saleId = new mongoose.Types.ObjectId();
      const ctr = await Counter.findOneAndUpdate({ _id: `receipt:${ownerId}` }, { $inc: { seq: 1 } }, { upsert: true, new: true, session });
      const receiptNo = `R-${String(ctr.seq).padStart(6, "0")}`;

      for (const l of lines) {
        let take = l.quantity;
        if (offline) { take = Math.min(l.quantity, Math.max(0, await currentQty(session, ownerId, branch, l.productId))); l.shortfall = l.quantity - take; }
        if (take > 0) {
          const ok = await changeBranchStock(session, { ownerId, productId: l.productId, branch, delta: -take, type: "sale_pos", ref: `pos:${saleId}:${l.productId}`, note: `Receipt ${receiptNo}`, actorId: cashierId });
          if (!ok) throw E("INSUFFICIENT_STOCK", 409, { product: l.name });
        }
      }

      const [created] = await Sale.create([{
        _id: saleId, sellerId: ownerId, cashierId, cashierName, branchId: branch._id, terminalId: terminalId || undefined, receiptNo, clientRef, lines, subtotal, discount, total,
        paymentMethod: method, amountTendered: tendered, change, mpesaRef, creditAmount, customerId: customer?._id || null, overLimit,
        customerName: customer ? customer.name : txt(b.customerName, 80), note: txt(b.note, 200),
        offline, flagged: flagged || priceFlag, ...(offline ? { syncedAt: new Date() } : {}), createdAt: soldAt,
      }], { session });

      if (customer) await CustomerEntry.create([{ sellerId: ownerId, customerId: customer._id, type: "credit_sale", amount: creditAmount, balanceAfter: customer.balance, saleId, note: `Receipt ${receiptNo}`, ref: `sale:${saleId}`, branchId: branch._id, actorId: cashierId }], { session });
      return created.toObject();
    });
    return { sale };
  } catch (e) {
    if (e.code === 11000) { const again = await Sale.findOne({ sellerId: ownerId, clientRef }).lean(); if (again) return { sale: again, replay: true }; }
    throw e;
  }
}

router.post("/sales", authenticate, shop, can("sell"), requireFeature("pos"), perUser(60), h(async (req, res) => {
  const ent = entitlementsFor(req.shop.owner);
  const branch = await resolveBranch(req, req.body?.branchId);
  const terminalId = ent.features.multiTerminal ? await checkTerminal(req.shop.ownerId, req.body?.terminalId, false) : null;
  const r = await recordSale({ ownerId: req.shop.ownerId, cashierId: req.user._id, cashierName: req.shop.memberName, branch, terminalId }, req.body || {}, { offline: false, ent, canPrice: has(req, "price.override") });
  res.status(r.replay ? 200 : 201).json({ ok: true, ...(r.replay ? { replay: true } : {}), sale: r.sale });
}));

// Sales made offline: each is processed on its own, so one bad sale never blocks the others
router.post("/sales/sync", authenticate, shop, can("sell"), requireFeature("pos"), perUser(30), h(async (req, res) => {
  const list = Array.isArray(req.body?.sales) ? req.body.sales.slice(0, 20) : null;
  if (!list?.length) throw E("INVALID_LINES");
  const ent = entitlementsFor(req.shop.owner), canPrice = has(req, "price.override"), results = [];
  for (const s of list) {
    const clientRef = typeof s?.clientRef === "string" ? s.clientRef : null;
    try {
      const branch = await resolveBranch(req, s?.branchId);
      const terminalId = ent.features.multiTerminal ? await checkTerminal(req.shop.ownerId, s?.terminalId, true) : null;
      const r = await recordSale({ ownerId: req.shop.ownerId, cashierId: req.user._id, cashierName: req.shop.memberName, branch, terminalId }, s || {}, { offline: true, ent, canPrice });
      results.push({ clientRef, ok: true, replay: !!r.replay, receiptNo: r.sale.receiptNo, shortfall: r.sale.lines.some((l) => l.shortfall > 0), overLimit: !!r.sale.overLimit, flagged: !!r.sale.flagged });
    } catch (e) {
      if (e.http) results.push({ clientRef, ok: false, error: e.message, product: e.extra?.product });
      else { console.error("❌ pos sync:", e.stack || e.message); results.push({ clientRef, ok: false, error: "SERVER_ERROR", retry: true }); }
    }
  }
  res.json({ ok: true, results });
}));

/** Sales for one day. Cashiers see only their own. */
router.get("/sales", authenticate, shop, can("sell"), perUser(60), h(async (req, res) => {
  const { start, end, label } = dayRange(req.query.date);
  const f = { sellerId: req.shop.ownerId, createdAt: { $gte: start, $lt: end }, ...branchScope(req, req.query.branchId) };
  if (!has(req, "sales.all")) f.cashierId = req.user._id;
  res.json({ ok: true, date: label, sales: await Sale.find(f).sort({ createdAt: -1 }).limit(200).select("-__v").lean() });
}));

/** Undo a sale within 24 hours (managers and owners). Stock goes back to the branch it was sold from. */
router.post("/sales/:id/void", authenticate.strict, shop, can("void"), requireFeature("pos"), perUser(20), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const { ownerId } = req.shop;
  const sale = await Sale.findOne({ _id: req.params.id, sellerId: ownerId }).lean();
  if (!sale) throw E("SALE_NOT_FOUND", 404);
  if (req.shop.branchIds && !req.shop.branchIds.includes(String(sale.branchId || req.shop.mainBranchId))) throw E("BRANCH_FORBIDDEN", 403);
  if (sale.voided) throw E("ALREADY_VOIDED", 409);
  if (Date.now() - new Date(sale.createdAt).getTime() > DAY) throw E("VOID_WINDOW_PASSED", 409);
  const branch = sale.branchId ? await Branch.findOne({ _id: sale.branchId, ownerId }).lean() : await Branch.findById(req.shop.mainBranchId).lean();
  if (!branch) throw E("BRANCH_NOT_FOUND", 404);
  if (!branch.isMain) await ensureRows(ownerId, branch._id, sale.lines.map((l) => l.productId));

  await mongoose.connection.transaction(async (session) => {
    const f = await Sale.findOneAndUpdate({ _id: sale._id, voided: false }, { $set: { voided: true, voidedAt: new Date() } }, { session });
    if (!f) throw E("ALREADY_VOIDED", 409);
    for (const l of sale.lines) {
      const back = l.quantity - (l.shortfall || 0);
      if (back > 0) await changeBranchStock(session, { ownerId, productId: l.productId, branch, delta: back, type: "void", ref: `void:${sale._id}:${l.productId}`, note: `Voided ${sale.receiptNo}`, actorId: req.user._id });
    }
    if (sale.creditAmount > 0 && sale.customerId) {
      const c = await Customer.findOneAndUpdate({ _id: sale.customerId, sellerId: ownerId }, { $inc: { balance: -sale.creditAmount } }, { new: true, session });
      if (c) await CustomerEntry.create([{ sellerId: ownerId, customerId: c._id, type: "void_sale", amount: -sale.creditAmount, balanceAfter: c.balance, saleId: sale._id, note: `Voided ${sale.receiptNo}`, ref: `void:${sale._id}`, branchId: branch._id, actorId: req.user._id }], { session });
    }
  });
  await audit(req, "sale_void", { branchId: branch._id, targetType: "sale", targetId: sale._id, detail: `${sale.receiptNo}, KES ${sale.total}` });
  res.json({ ok: true });
}));

/** Daily report, for one branch or all the branches you can reach */
router.get("/report", authenticate, shop, can("reports"), perUser(30), h(async (req, res) => {
  const { start, end, label } = dayRange(req.query.date);
  const { ownerId } = req.shop;
  const scope = branchScope(req, req.query.branchId);
  const single = scope.branchId && !scope.branchId.$in ? scope.branchId : null;
  const match = { sellerId: ownerId, createdAt: { $gte: start, $lt: end }, ...scope };
  const live = { ...match, voided: false };
  const [tot, pay, items, voidedCount, online, close, creditAgg, debtAgg, owedAgg, cashiers, flagged] = await Promise.all([
    Sale.aggregate([{ $match: live }, { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: "$total" }, discount: { $sum: "$discount" } } }]),
    Sale.aggregate([{ $match: live }, { $group: { _id: "$paymentMethod", count: { $sum: 1 }, total: { $sum: { $subtract: ["$total", { $ifNull: ["$creditAmount", 0] }] } } } }]),
    Sale.aggregate([
      { $match: live }, { $unwind: "$lines" },
      { $group: { _id: "$lines.productId", name: { $first: "$lines.name" }, qty: { $sum: "$lines.quantity" }, revenue: { $sum: "$lines.lineTotal" },
        cost: { $sum: { $cond: [{ $ne: ["$lines.unitCost", null] }, { $multiply: ["$lines.unitCost", "$lines.quantity"] }, 0] } },
        costedRevenue: { $sum: { $cond: [{ $ne: ["$lines.unitCost", null] }, "$lines.lineTotal", 0] } } } },
      { $sort: { revenue: -1 } }, { $limit: 100 },
    ]),
    Sale.countDocuments({ ...match, voided: true }),
    Order.aggregate([{ $match: { sellerId: ownerId, orderStatus: "DELIVERED", deliveredAt: { $gte: start, $lt: end } } }, { $group: { _id: null, count: { $sum: 1 }, received: { $sum: "$financials.totalWholesaleToShop" } } }]),
    single ? CashClose.findOne({ sellerId: ownerId, branchId: single, date: label }).lean() : null,
    Sale.aggregate([{ $match: live }, { $group: { _id: null, given: { $sum: { $ifNull: ["$creditAmount", 0] } } } }]),
    CustomerEntry.aggregate([{ $match: { sellerId: ownerId, type: "payment", createdAt: { $gte: start, $lt: end }, ...scope } }, { $group: { _id: "$method", total: { $sum: { $multiply: ["$amount", -1] } } } }]),
    Customer.aggregate([{ $match: { sellerId: ownerId, balance: { $gt: 0 } } }, { $group: { _id: null, owed: { $sum: "$balance" }, n: { $sum: 1 } } }]),
    Sale.aggregate([{ $match: live }, { $group: { _id: "$cashierId", name: { $first: "$cashierName" }, count: { $sum: 1 }, revenue: { $sum: "$total" } } }, { $sort: { revenue: -1 } }]),
    Sale.countDocuments({ ...live, flagged: true }),
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
    online: { count: online[0]?.count || 0, received: online[0]?.received || 0 }, // online orders belong to the whole shop
    voidedCount, close, flagged,
    credit: { given: creditAgg[0]?.given || 0 },
    debt: { cash: debtAgg.find((d) => d._id === "cash")?.total || 0, mpesa: debtAgg.find((d) => d._id === "mpesa")?.total || 0 },
    owed: { total: owedAgg[0]?.owed || 0, customers: owedAgg[0]?.n || 0 },
    cashiers: cashiers.map((c) => ({ cashierId: c._id, name: c.name || "Staff", count: c.count, revenue: c.revenue })),
  });
}));

/** Close a branch's day: compare counted cash with what the sales say should be there */
router.post("/close", authenticate.strict, shop, can("close"), requireFeature("pos"), perUser(10), h(async (req, res) => {
  const { start, end, label } = dayRange(req.body?.date);
  if (start.getTime() > Date.now()) throw E("INVALID_DATE");
  const counted = req.body?.countedCash;
  if (!int(counted, 0, MAX_PRICE * 50)) throw E("INVALID_AMOUNT");
  const branch = await resolveBranch(req, req.body?.branchId);
  const { ownerId } = req.shop;
  const [cash, debtCash] = await Promise.all([
    Sale.aggregate([{ $match: { sellerId: ownerId, branchId: branch._id, createdAt: { $gte: start, $lt: end }, voided: false, paymentMethod: "cash" } }, { $group: { _id: null, total: { $sum: { $subtract: ["$total", { $ifNull: ["$creditAmount", 0] }] } } } }]),
    CustomerEntry.aggregate([{ $match: { sellerId: ownerId, branchId: branch._id, type: "payment", method: "cash", createdAt: { $gte: start, $lt: end } } }, { $group: { _id: null, total: { $sum: { $multiply: ["$amount", -1] } } } }]),
  ]);
  const expected = (cash[0]?.total || 0) + (debtCash[0]?.total || 0);
  try {
    const c = await CashClose.create({ sellerId: ownerId, branchId: branch._id, date: label, expectedCash: expected, countedCash: counted, difference: counted - expected, note: txt(req.body?.note, 200) });
    await audit(req, "cash_close", { branchId: branch._id, detail: `${branch.name} ${label}: expected ${expected}, counted ${counted}` });
    res.status(201).json({ ok: true, close: c.toObject() });
  } catch (e) { if (e.code === 11000) throw E("ALREADY_CLOSED", 409); throw e; }
}));

module.exports = router;
