const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");
const authenticate = require("../../middleware/authenticate");
const { perUser } = require("../../middleware/limits");
const { shop, can, has, resolveBranch, E } = require("../../middleware/shop");
const { requireFeature, entitlementsFor } = require("../membership/entitlements");
const { BUILT } = require("../config/plans");
const Branch = require("../../models/Branch");
const BranchStock = require("../../models/BranchStock");
const Product = require("../../models/Product");
const ShopMember = require("../../models/ShopMember");
const Terminal = require("../../models/Terminal");
const StockTransfer = require("../../models/StockTransfer");
const ShopAudit = require("../../models/ShopAudit");
const UserProfile = require("../../models/UserProfile");
const Counter = require("../../models/Counter");
const { changeBranchStock, ensureRows } = require("../../services/branchStock");
const { audit } = require("../../services/shopAudit");
const ApiKey = require("../../models/ApiKey");
const ShopSettings = require("../../models/ShopSettings");
const Sale = require("../../models/Sale");
const Customer = require("../../models/Customer");
const CustomerEntry = require("../../models/CustomerEntry");
const ProductCost = require("../../models/ProductCost");
const { sha } = require("../../middleware/apiKey");

const router = express.Router();
const MAX_QTY = 100000;
const isId = (v) => typeof v === "string" && mongoose.isValidObjectId(v);
const txt = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max) : "");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const h = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.message, ...(e.extra || {}) });
    console.error("❌ shop:", e.stack || e.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};
const limitErr = (limit, max) => E("PLAN_LIMIT_REACHED", 403, { limit, max });

/* ───────── Who am I in this shop ───────── */
router.get(
  "/me",
  authenticate,
  shop,
  perUser(60),
  h(async (req, res) => {
    const { ownerId, owner, role, perms, branchIds, mainBranchId } = req.shop;
    const ent = entitlementsFor(owner);

    const [all, prof, st] = await Promise.all([
      Branch.find({ ownerId, archived: false })
        .sort({ isMain: -1, name: 1 })
        .select("name address isMain")
        .lean(),
      UserProfile.findOne({ userId: ownerId })
        .select("brandName displayName location.county")
        .lean(),
      ShopSettings.findOne({ ownerId }).lean(),
    ]);

    res.json({
      ok: true,
      role,
      perms,
      ownerId,
      mainBranchId,
      status: owner.membershipStatus,
      memberName: req.shop.memberName,
      ownerName: prof?.brandName || prof?.displayName || "Shop",
      county: prof?.location?.county || "",
      branches: branchIds
        ? all.filter((b) => branchIds.includes(String(b._id)))
        : all,
      allBranches: all.map((b) => ({ _id: b._id, name: b.name })),
      ent,
      built: BUILT,
      branding:
        ent.features.receiptBranding && st
          ? {
              logo: st.logo,
              footer: st.footer,
              phone: st.phone,
              taxPin: st.taxPin,
            }
          : null,
    });
  })
);

/* ───────── Branches (owner) ───────── */
router.post("/branches", authenticate, shop, can("branches"), requireFeature("multiBranch"), perUser(20), h(async (req, res) => {
  const ent = entitlementsFor(req.shop.owner);
  const name = txt(req.body?.name, 60);
  if (!name) throw E("INVALID_NAME");
  if ((await Branch.countDocuments({ ownerId: req.shop.ownerId, archived: false })) >= ent.limits.branches) throw limitErr("branches", ent.limits.branches);
  const b = await Branch.create({ ownerId: req.shop.ownerId, name, address: txt(req.body?.address, 200) });
  await audit(req, "branch_create", { branchId: b._id, detail: name });
  res.status(201).json({ ok: true, branch: { _id: b._id, name: b.name, address: b.address, isMain: false } });
}));

router.patch("/branches/:id", authenticate, shop, can("branches"), perUser(30), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const { ownerId } = req.shop, b = req.body || {}, set = {};
  const br = await Branch.findOne({ _id: req.params.id, ownerId }).lean();
  if (!br) throw E("BRANCH_NOT_FOUND", 404);
  if (b.name !== undefined) { const n = txt(b.name, 60); if (!n) throw E("INVALID_NAME"); set.name = n; }
  if (b.address !== undefined) set.address = txt(b.address, 200);
  if (b.archived === true) {
    if (br.isMain) throw E("CANNOT_ARCHIVE_MAIN", 409);
    if (await BranchStock.exists({ branchId: br._id, quantity: { $gt: 0 } })) throw E("BRANCH_HAS_STOCK", 409);
    if (await ShopMember.exists({ ownerId, status: { $in: ["invited", "active"] }, branchIds: br._id })) throw E("BRANCH_IN_USE", 409);
    set.archived = true;
  }
  if (!Object.keys(set).length) throw E("NOTHING_TO_UPDATE");
  await Branch.updateOne({ _id: br._id }, { $set: set });
  await audit(req, set.archived ? "branch_archive" : "branch_update", { branchId: br._id, detail: set.name || br.name });
  res.json({ ok: true });
}));

/* ───────── Stock by branch ───────── */
router.get("/stock", authenticate, shop, can("stock.view"), perUser(60), h(async (req, res) => {
  const branch = await resolveBranch(req, req.query.branchId);
  const q = txt(req.query.q, 40);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const f = { sellerId: req.shop.ownerId };
  if (q) { const rx = new RegExp(esc(q), "i"); f.$or = [{ name: rx }, { productCode: rx }, { barcode: rx }]; }
  const prods = await Product.find(f).sort({ name: 1 }).skip((page - 1) * 40).limit(41).select("name productCode barcode quantity imageUrl").lean();
  const rows = prods.slice(0, 40);
  let by = new Map();
  if (!branch.isMain) {
    const bs = await BranchStock.find({ branchId: branch._id, productId: { $in: rows.map((r) => r._id) } }).select("productId quantity").lean();
    by = new Map(bs.map((b) => [String(b.productId), b.quantity]));
  }
  res.json({ ok: true, hasMore: prods.length > 40, branchId: branch._id,
    items: rows.map((p) => ({ _id: p._id, name: p.name, productCode: p.productCode, barcode: p.barcode, imageUrl: p.imageUrl, quantity: branch.isMain ? p.quantity : by.get(String(p._id)) || 0 })) });
}));

// body: { productId, branchId, delta, note, kind? }. Taking stock out needs a reason.
router.post("/stock/adjust", authenticate, shop, can("stock.adjust"), requireFeature("stockHistory"), perUser(60), h(async (req, res) => {
  const b = req.body || {};
  if (!isId(b.productId)) throw E("INVALID_ID");
  if (!Number.isInteger(b.delta) || b.delta === 0 || Math.abs(b.delta) > MAX_QTY) throw E("INVALID_STOCK_CHANGE");
  const note = txt(b.note, 200);
  if (b.delta < 0 && note.length < 3) throw E("NOTE_REQUIRED");
  const branch = await resolveBranch(req, b.branchId);
  const { ownerId } = req.shop;
  if (!branch.isMain && b.delta > 0) await ensureRows(ownerId, branch._id, [b.productId]);
  const row = await mongoose.connection.transaction((session) => changeBranchStock(session, {
    ownerId, productId: b.productId, branch, delta: b.delta, type: b.delta > 0 && b.kind === "restock" ? "restock" : "adjustment", note, actorId: req.user._id, max: MAX_QTY }));
  if (!row) throw (await Product.exists({ _id: b.productId, sellerId: ownerId })) ? E("STOCK_CHANGE_NOT_POSSIBLE", 409) : E("PRODUCT_NOT_FOUND", 404);
  await audit(req, "stock_adjust", { branchId: branch._id, targetType: "product", targetId: b.productId, detail: `${b.delta > 0 ? "+" : ""}${b.delta} at ${branch.name}${note ? `: ${note}` : ""}` });
  res.json({ ok: true, quantity: row.quantity });
}));

/* ───────── Transfers between branches ───────── */
router.get("/transfers", authenticate, shop, can("transfer"), perUser(60), h(async (req, res) => {
  const ids = req.shop.branchIds;
  const f = { ownerId: req.shop.ownerId, ...(ids ? { $or: [{ fromBranchId: { $in: ids } }, { toBranchId: { $in: ids } }] } : {}) };
  res.json({ ok: true, transfers: await StockTransfer.find(f).sort({ createdAt: -1 }).limit(30).select("-__v").lean() });
}));

router.post("/transfers", authenticate, shop, can("transfer"), requireFeature("multiBranch"), perUser(30), h(async (req, res) => {
  const { ownerId } = req.shop, b = req.body || {};
  const clientRef = typeof b.clientRef === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(b.clientRef) ? b.clientRef : null;
  if (!clientRef) throw E("CLIENT_REF_REQUIRED");
  const prior = await StockTransfer.findOne({ ownerId, clientRef }).lean();
  if (prior) return res.json({ ok: true, replay: true, transfer: prior });

  const from = await resolveBranch(req, b.fromBranchId); // you can only take stock from a branch you work at
  if (!isId(b.toBranchId)) throw E("INVALID_BRANCH");
  const to = await Branch.findOne({ _id: b.toBranchId, ownerId, archived: false }).lean();
  if (!to) throw E("BRANCH_NOT_FOUND", 404);
  if (String(to._id) === String(from._id)) throw E("SAME_BRANCH");
  if (!Array.isArray(b.lines) || b.lines.length < 1 || b.lines.length > 50) throw E("INVALID_LINES");
  const seen = new Set();
  for (const l of b.lines) {
    if (!isId(l?.productId) || !Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > MAX_QTY || seen.has(l.productId)) throw E("INVALID_LINES");
    seen.add(l.productId);
  }
  const prods = await Product.find({ _id: { $in: [...seen] }, sellerId: ownerId }).select("name").lean();
  if (prods.length !== seen.size) throw E("PRODUCT_NOT_FOUND", 404);
  const name = new Map(prods.map((p) => [String(p._id), p.name]));
  if (!to.isMain) await ensureRows(ownerId, to._id, [...seen]);

  try {
    const t = await mongoose.connection.transaction(async (session) => {
      const id = new mongoose.Types.ObjectId();
      const ctr = await Counter.findOneAndUpdate({ _id: `tr:${ownerId}` }, { $inc: { seq: 1 } }, { upsert: true, new: true, session });
      for (const l of b.lines) {
        const out = await changeBranchStock(session, { ownerId, productId: l.productId, branch: from, delta: -l.quantity, type: "transfer_out", ref: `tr:${id}:${l.productId}:out`, note: `Transfer to ${to.name}`, actorId: req.user._id });
        if (!out) throw E("INSUFFICIENT_STOCK", 409, { product: name.get(l.productId) });
        const inn = await changeBranchStock(session, { ownerId, productId: l.productId, branch: to, delta: l.quantity, type: "transfer_in", ref: `tr:${id}:${l.productId}:in`, note: `Transfer from ${from.name}`, actorId: req.user._id, max: MAX_QTY });
        if (!inn) throw E("STOCK_CHANGE_NOT_POSSIBLE", 409, { product: name.get(l.productId) });
      }
      const [doc] = await StockTransfer.create([{ _id: id, ownerId, transferNo: `TR-${String(ctr.seq).padStart(4, "0")}`, fromBranchId: from._id, toBranchId: to._id, fromName: from.name, toName: to.name,
        lines: b.lines.map((l) => ({ productId: l.productId, name: name.get(l.productId), quantity: l.quantity })), note: txt(b.note, 200), byUserId: req.user._id, byName: req.shop.memberName, clientRef }], { session });
      return doc.toObject();
    });
    await audit(req, "stock_transfer", { branchId: from._id, targetType: "transfer", targetId: t._id, detail: `${t.transferNo}: ${from.name} to ${to.name}, ${b.lines.length} item(s)` });
    res.status(201).json({ ok: true, transfer: t });
  } catch (e) {
    if (e.code === 11000) { const again = await StockTransfer.findOne({ ownerId, clientRef }).lean(); if (again) return res.json({ ok: true, replay: true, transfer: again }); }
    throw e;
  }
}));

/* ───────── Staff ───────── */
const ROLES = ["manager", "cashier", "stock_clerk"];
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = () => Array.from({ length: 10 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join("");
const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const hashCode = (c) => crypto.createHash("sha256").update(c).digest("hex");

async function checkBranches(ownerId, raw, role) {
  const ids = Array.isArray(raw) ? [...new Set(raw.map(String))] : [];
  if (ids.length > 20 || !ids.every(isId)) throw E("INVALID_BRANCH");
  if (ids.length && (await Branch.countDocuments({ _id: { $in: ids }, ownerId, archived: false })) !== ids.length) throw E("BRANCH_NOT_FOUND", 404);
  if (role !== "manager" && !ids.length) throw E("BRANCH_REQUIRED");
  return ids;
}

router.get("/staff", authenticate, shop, can("staff"), perUser(30), h(async (req, res) => {
  const rows = await ShopMember.find({ ownerId: req.shop.ownerId, status: { $in: ["invited", "active"] } }).sort({ createdAt: -1 }).select("role branchIds status label displayName codeExpiresAt joinedAt").lean();
  res.json({ ok: true, staff: rows });
}));

router.post("/staff/invites", authenticate, shop, can("staff"), requireFeature("staffRoles"), perUser(20), h(async (req, res) => {
  const { ownerId } = req.shop, b = req.body || {};
  if (!ROLES.includes(b.role)) throw E("INVALID_ROLE");
  const branchIds = await checkBranches(ownerId, b.branchIds, b.role);
  await ShopMember.deleteMany({ ownerId, status: "invited", codeExpiresAt: { $lt: new Date() } }); // expired invites free their slot
  const ent = entitlementsFor(req.shop.owner);
  if ((await ShopMember.countDocuments({ ownerId, status: { $in: ["invited", "active"] } })) >= ent.limits.staff) throw limitErr("staff", ent.limits.staff);
  const code = makeCode();
  const m = await ShopMember.create({ ownerId, role: b.role, branchIds, label: txt(b.label, 40), codeHash: hashCode(code), codeExpiresAt: new Date(Date.now() + 3 * 86400000) });
  await audit(req, "staff_invite", { targetType: "staff", targetId: m._id, detail: `${b.role}${m.label ? ` (${m.label})` : ""}` });
  res.status(201).json({ ok: true, code: `${code.slice(0, 5)}-${code.slice(5)}`, expiresAt: m.codeExpiresAt, id: m._id }); // shown once: only the hash is stored
}));

// body: { role?, branchIds?, remove? }
router.patch("/staff/:id", authenticate, shop, can("staff"), perUser(30), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const { ownerId } = req.shop, b = req.body || {};
  const m = await ShopMember.findOne({ _id: req.params.id, ownerId, status: { $in: ["invited", "active"] } }).lean();
  if (!m) throw E("STAFF_NOT_FOUND", 404);
  if (b.remove === true) {
    await ShopMember.updateOne({ _id: m._id }, { $set: { status: "removed", removedAt: new Date() }, $unset: { codeHash: "", codeExpiresAt: "" } });
    await audit(req, "staff_remove", { targetType: "staff", targetId: m._id, detail: m.displayName || m.label || m.role });
    return res.json({ ok: true });
  }
  const role = b.role === undefined ? m.role : b.role;
  if (!ROLES.includes(role)) throw E("INVALID_ROLE");
  const branchIds = b.branchIds === undefined && role === m.role ? m.branchIds.map(String) : await checkBranches(ownerId, b.branchIds ?? m.branchIds.map(String), role);
  await ShopMember.updateOne({ _id: m._id }, { $set: { role, branchIds } });
  await audit(req, "staff_update", { targetType: "staff", targetId: m._id, detail: `${m.displayName || m.label || "staff"}: ${role}` });
  res.json({ ok: true });
}));

// A signed-in, non-marketer account redeems an invite code
router.post("/staff/join", authenticate.strict, perUser(5), h(async (req, res) => {
  if (req.user.accountCategory === "network") throw E("MARKETERS_CANNOT_JOIN", 409);
  if (await ShopMember.exists({ userId: req.user._id, status: "active" })) throw E("ALREADY_STAFF", 409);
  const code = norm(req.body?.code);
  if (code.length !== 10) throw E("INVALID_CODE", 404);
  const p = await UserProfile.findOne({ userId: req.user._id }).select("displayName firstName lastName").lean();
  const name = (p?.displayName || [p?.firstName, p?.lastName].filter(Boolean).join(" ") || "Staff").slice(0, 80);
  let m;
  try {
    m = await ShopMember.findOneAndUpdate(
      { codeHash: hashCode(code), status: "invited", codeExpiresAt: { $gt: new Date() } },
      { $set: { userId: req.user._id, status: "active", joinedAt: new Date(), displayName: name }, $unset: { codeHash: "", codeExpiresAt: "" } },
      { new: true });
  } catch (e) { if (e.code === 11000) throw E("ALREADY_STAFF", 409); throw e; }
  if (!m) throw E("INVALID_CODE", 404); // wrong, used and expired codes look the same
  await ShopAudit.create({ ownerId: m.ownerId, actorId: req.user._id, actorName: name, role: m.role, action: "staff_join", detail: m.role }).catch(() => {});
  res.json({ ok: true });
}));

/* ───────── Devices ───────── */
router.post("/terminals/register", authenticate, shop, can("sell"), requireFeature("multiTerminal"), perUser(20), h(async (req, res) => {
  const { ownerId } = req.shop, b = req.body || {};
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(b.deviceId || "")) throw E("INVALID_DEVICE");
  const branch = await resolveBranch(req, b.branchId);
  let t = await Terminal.findOne({ ownerId, deviceId: b.deviceId });
  if (t) {
    if (t.status === "revoked") throw E("TERMINAL_REVOKED", 403);
    t.lastSeenAt = new Date(); t.branchId = branch._id;
    await t.save();
  } else {
    const ent = entitlementsFor(req.shop.owner);
    if ((await Terminal.countDocuments({ ownerId, status: "active" })) >= ent.limits.terminals) throw limitErr("terminals", ent.limits.terminals);
    try { t = await Terminal.create({ ownerId, deviceId: b.deviceId, name: txt(b.name, 40) || "Till", branchId: branch._id, lastSeenAt: new Date() }); }
    catch (e) { if (e.code !== 11000) throw e; t = await Terminal.findOne({ ownerId, deviceId: b.deviceId }); }
  }
  res.json({ ok: true, terminal: { _id: t._id, name: t.name, status: t.status } });
}));

router.get("/terminals", authenticate, shop, can("terminals"), perUser(30), h(async (req, res) => {
  res.json({ ok: true, terminals: await Terminal.find({ ownerId: req.shop.ownerId }).sort({ createdAt: -1 }).limit(100).select("name branchId status lastSeenAt").lean() });
}));

router.patch("/terminals/:id", authenticate, shop, can("terminals"), perUser(30), h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const { ownerId } = req.shop, b = req.body || {}, set = {};
  if (b.name !== undefined) set.name = txt(b.name, 40) || "Till";
  if (b.status === "revoked") { set.status = "revoked"; set.revokedAt = new Date(); }
  if (b.status === "active") {
    const ent = entitlementsFor(req.shop.owner);
    if ((await Terminal.countDocuments({ ownerId, status: "active" })) >= ent.limits.terminals) throw limitErr("terminals", ent.limits.terminals);
    set.status = "active";
  }
  if (!Object.keys(set).length) throw E("NOTHING_TO_UPDATE");
  const t = await Terminal.findOneAndUpdate({ _id: req.params.id, ownerId }, { $set: set }, { new: true });
  if (!t) throw E("TERMINAL_NOT_FOUND", 404);
  await audit(req, set.status ? `terminal_${set.status}` : "terminal_rename", { targetType: "terminal", targetId: t._id, detail: t.name });
  res.json({ ok: true });
}));

/* ───────── Activity log (owner) ───────── */
router.get("/audit", authenticate, shop, can("audit"), requireFeature("auditLog"), perUser(30), h(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const rows = await ShopAudit.find({ ownerId: req.shop.ownerId }).sort({ createdAt: -1 }).skip((page - 1) * 50).limit(51).select("-__v").lean();
  res.json({ ok: true, hasMore: rows.length > 50, items: rows.slice(0, 50) });
}));

module.exports = router;
