const express = require("express");
const mongoose = require("mongoose");
const authenticate = require("../../middleware/authenticate");
const { perUser } = require("../../middleware/limits");
const Customer = require("../../models/Customer");
const CustomerEntry = require("../../models/CustomerEntry");
const { requireFeature } = require("../membership/entitlements");

const router = express.Router();
const MAX = 5000000, MAX_CUSTOMERS = 5000;
const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const isId = (v) => typeof v === "string" && mongoose.isValidObjectId(v);
const E = (message, http = 400) => Object.assign(new Error(message), { http });
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const txt = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max) : "");
const member = (req, res, next) => (req.user?.accountCategory === "network" ? next() : res.status(403).json({ error: "MARKETER_ACCOUNT_REQUIRED" }));
const h = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.message });
    console.error("❌ customers:", e.stack || e.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};
const phoneOf = (raw) => {
  const p = String(raw || "").replace(/[\s+-]/g, "");
  if (/^0[17]\d{8}$/.test(p)) return `254${p.slice(1)}`;
  return /^254[17]\d{8}$/.test(p) ? p : null;
};
const view = (c) => ({ _id: c._id, name: c.name, phone: c.phone, note: c.note, balance: c.balance, creditLimit: c.creditLimit, lastCreditAt: c.lastCreditAt, archived: c.archived });
const limitOf = (v) => (v === undefined || v === null || v === "" ? null : v);
const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };

// Reading is open to every member (even a lapsed one: it's their own record). Writing needs the plan feature.
router.get("/summary", authenticate, member, perUser(30), h(async (req, res) => {
  const [s] = await Customer.aggregate([{ $match: { sellerId: req.user._id, balance: { $gt: 0 } } }, { $group: { _id: null, owed: { $sum: "$balance" }, owing: { $sum: 1 } } }]);
  res.json({ ok: true, owed: s?.owed || 0, owing: s?.owing || 0 });
}));

router.get("/lookup", authenticate, member, perUser(30), h(async (req, res) => {
  const rows = await Customer.find({ sellerId: req.user._id, archived: false }).sort({ name: 1 }).limit(2000).select("name phone balance creditLimit").lean();
  res.json({ ok: true, customers: rows });
}));

router.get("/export.csv", authenticate, member, requireFeature("export"), perUser(5), h(async (req, res) => {
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sokodigi-customers-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" });
  res.write("\ufeffName,Phone,Owes,Credit limit,Note\n");
  for await (const c of Customer.find({ sellerId: req.user._id }).sort({ name: 1 }).lean().cursor()) res.write([c.name, c.phone, c.balance, c.creditLimit, c.note].map(cell).join(",") + "\n");
  res.end();
}));

router.get("/", authenticate, member, perUser(60), h(async (req, res) => {
  const q = txt(req.query.q, 40);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const f = { sellerId: req.user._id, archived: false };
  if (req.query.filter === "owing") f.balance = { $gt: 0 };
  if (q) { const rx = new RegExp(esc(q), "i"); f.$or = [{ name: rx }, { phone: rx }]; }
  const rows = await Customer.find(f).sort(req.query.filter === "owing" ? { balance: -1 } : { name: 1 }).skip((page - 1) * 30).limit(31).lean();
  res.json({ ok: true, hasMore: rows.length > 30, customers: rows.slice(0, 30).map(view) });
}));

router.post("/", authenticate, member, requireFeature("customers"), perUser(30), h(async (req, res) => {
  const b = req.body || {};
  const name = txt(b.name, 80);
  if (!name) throw E("INVALID_NAME");
  let phone = null;
  if (b.phone) { phone = phoneOf(b.phone); if (!phone) throw E("INVALID_PHONE"); }
  const creditLimit = limitOf(b.creditLimit);
  if (creditLimit !== null && !int(creditLimit, 0, MAX)) throw E("INVALID_LIMIT");
  if ((await Customer.countDocuments({ sellerId: req.user._id })) >= MAX_CUSTOMERS) throw E("CUSTOMER_LIMIT", 403);
  try {
    const c = await Customer.create({ sellerId: req.user._id, name, phone, note: txt(b.note, 200), creditLimit });
    res.status(201).json({ ok: true, customer: view(c) });
  } catch (e) { if (e.code === 11000) throw E("PHONE_TAKEN", 409); throw e; }
}));

router.patch("/:id", authenticate, member, requireFeature("customers"), perUser(60), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const b = req.body || {};
  const set = {}, filter = { _id: req.params.id, sellerId: req.user._id };
  if (b.name !== undefined) { const n = txt(b.name, 80); if (!n) throw E("INVALID_NAME"); set.name = n; }
  if (b.phone !== undefined) { set.phone = b.phone ? phoneOf(b.phone) : null; if (b.phone && !set.phone) throw E("INVALID_PHONE"); }
  if (b.note !== undefined) set.note = txt(b.note, 200);
  if (b.creditLimit !== undefined) { const l = limitOf(b.creditLimit); if (l !== null && !int(l, 0, MAX)) throw E("INVALID_LIMIT"); set.creditLimit = l; }
  if (b.archived !== undefined) { if (typeof b.archived !== "boolean") throw E("INVALID_ACTION"); set.archived = b.archived; if (b.archived) filter.balance = 0; }
  if (!Object.keys(set).length) throw E("NOTHING_TO_UPDATE");
  try {
    const c = await Customer.findOneAndUpdate(filter, { $set: set }, { new: true });
    if (!c) throw E((await Customer.exists({ _id: req.params.id, sellerId: req.user._id })) ? "HAS_BALANCE" : "CUSTOMER_NOT_FOUND", (await Customer.exists({ _id: req.params.id, sellerId: req.user._id })) ? 409 : 404);
    res.json({ ok: true, customer: view(c) });
  } catch (e) { if (e.code === 11000) throw E("PHONE_TAKEN", 409); throw e; }
}));

router.get("/:id", authenticate, member, perUser(60), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const c = await Customer.findOne({ _id: req.params.id, sellerId: req.user._id }).lean();
  if (!c) throw E("CUSTOMER_NOT_FOUND", 404);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const rows = await CustomerEntry.find({ customerId: c._id }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 30).limit(31)
    .select("type amount balanceAfter method mpesaRef note createdAt").lean();
  res.json({ ok: true, customer: view(c), hasMore: rows.length > 30, entries: rows.slice(0, 30) });
}));

// Record a payment against a debt. A retry with the same clientRef is harmless.
router.post("/:id/payments", authenticate.strict, member, requireFeature("customers"), perUser(60), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const me = req.user._id, b = req.body || {};
  const clientRef = typeof b.clientRef === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(b.clientRef) ? b.clientRef : null;
  if (!clientRef) throw E("CLIENT_REF_REQUIRED");
  if (!int(b.amount, 1, MAX)) throw E("INVALID_AMOUNT");
  if (!["cash", "mpesa"].includes(b.method)) throw E("INVALID_PAYMENT");
  const mpesaRef = typeof b.mpesaRef === "string" ? b.mpesaRef.trim().toUpperCase() : "";
  if (mpesaRef && !/^[A-Z0-9]{10}$/.test(mpesaRef)) throw E("INVALID_MPESA_REF");
  const ref = `pay:${clientRef}`;

  const prior = await CustomerEntry.findOne({ sellerId: me, ref }).lean();
  if (prior) return res.json({ ok: true, replay: true, balance: prior.balanceAfter });
  try {
    const balance = await mongoose.connection.transaction(async (session) => {
      const c = await Customer.findOneAndUpdate({ _id: req.params.id, sellerId: me, balance: { $gte: b.amount } }, { $inc: { balance: -b.amount } }, { new: true, session });
      if (!c) {
        const exists = await Customer.exists({ _id: req.params.id, sellerId: me }).session(session);
        throw E(exists ? "OVERPAYMENT" : "CUSTOMER_NOT_FOUND", exists ? 409 : 404);
      }
      await CustomerEntry.create([{ sellerId: me, customerId: c._id, type: "payment", amount: -b.amount, balanceAfter: c.balance, method: b.method, mpesaRef, note: txt(b.note, 200), ref }], { session });
      return c.balance;
    });
    res.status(201).json({ ok: true, balance });
  } catch (e) {
    if (e.code === 11000) { const again = await CustomerEntry.findOne({ sellerId: me, ref }).lean(); if (again) return res.json({ ok: true, replay: true, balance: again.balanceAfter }); }
    throw e;
  }
}));

module.exports = router;
