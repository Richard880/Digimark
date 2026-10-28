const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const fbAdmin = require("../../config/firebaseAdmin");
const authenticate = require("../../middleware/authenticate");
const User = require("../../models/User");
const UserProfile = require("../../models/UserProfile");
const Wallet = require("../../models/Wallet");
const Product = require("../../models/Product");
const Order = require("../../models/Order");
const Withdrawal = require("../../models/Withdrawal");
const MpesaTopUp = require("../../models/MpesaTopUp");
const AdminAction = require("../../models/AdminAction");
const { notify } = require("../../services/notification.service");
const { completeWithdrawal, failWithdrawal, dispatchPayout } = require("../wallet/withdraw.controller");
const { refundEscrowToBuyer, releaseEscrowToVendor, EscrowError } = require("../wallet/escrow.service");
const Report = require("../../models/Report");
const Dispute = require("../../models/Dispute");
const ReconciliationRun = require("../../models/ReconciliationRun");





const router = express.Router();
const PLATFORM_ID = process.env.PLATFORM_WALLET_USER_ID;
const ADMIN_ROLES = ["admin", "super_admin"];
const STALE_MS = 30 * 60 * 1000;
const RECEIPT_RE = /^[A-Z0-9]{10}$/;

const E = (message, http = 400) => Object.assign(new Error(message), { http });
const isId = (v) => typeof v === "string" && mongoose.isValidObjectId(v);
const same = (a, b) => String(a) === String(b);
const reason = (v) => (typeof v === "string" && v.trim().length >= 5 && v.trim().length <= 200 ? v.trim() : null);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const h = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e instanceof EscrowError) return res.status(e.status).json({ error: e.code });
    if (e.http) return res.status(e.http).json({ error: e.message });
    if (e.code === 11000) return res.status(409).json({ error: "DUPLICATE_RECEIPT" });
    console.error("❌ admin:", e.stack || e.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// Anyone who isn't a verified admin gets the same 404 as a page that doesn't exist
const adminOnly = (req, res, next) => {
  if (!ADMIN_ROLES.includes(req.user?.role) || !req.firebaseUser?.email_verified) return res.sendStatus(404);
  // Once admins use a second factor, require it for every admin request
  if (process.env.ADMIN_REQUIRE_MFA === "true" && !req.firebaseUser?.firebase?.sign_in_second_factor) {
    return res.status(403).json({ error: "MFA_REQUIRED" });
  }
  next();
};

router.use(authenticate.strict, adminOnly,
  rateLimit({ windowMs: 60 * 1000, limit: 90, keyGenerator: (req) => String(req.user._id), message: { error: "TOO_MANY_REQUESTS" } }));

const audit = (req, action, targetType, targetId, note, meta = {}) =>
  AdminAction.create({ adminId: req.user._id, adminEmail: req.user.email, action, targetType, targetId: String(targetId), note, meta })
    .catch((e) => console.error("❌ audit write failed:", e.message));

const stuckWithdrawals = () => ({
  $or: [
    { status: { $in: ["REVIEW", "AWAITING_APPROVAL"] } },
    { status: { $in: ["PENDING_PAYOUT", "SUBMITTED"] }, updatedAt: { $lt: new Date(Date.now() - STALE_MS) } },
  ],
});

const stuckTopups = () => ({
  $or: [{ status: "REVIEW" }, { status: "PENDING", createdAt: { $lt: new Date(Date.now() - STALE_MS) } }],
});

async function withNames(rows) {
  const profs = await UserProfile.find({ userId: { $in: rows.map((r) => r.userId) } })
    .select("userId username displayName brandName").lean();
  const by = new Map(profs.map((p) => [String(p.userId), p]));
  return rows.map((r) => {
    const p = by.get(String(r.userId)) || {};
    return { ...r, who: p.brandName || p.displayName || p.username || String(r.userId) };
  });
}

/* ───────── Overview ───────── */
router.get("/overview", h(async (_req, res) => {
  // 1. Resolve all admin monitoring document checks concurrently
  const [wd, tu, frozen, suspended, disputesOpen, recon, reportsOpen] = await Promise.all([
    Withdrawal.countDocuments(stuckWithdrawals()),
    MpesaTopUp.countDocuments(stuckTopups()),
    Wallet.countDocuments({ isFrozen: true }),
    User.countDocuments({ membershipStatus: "suspended" }),
    Dispute.countDocuments({ status: "open" }),
    ReconciliationRun.findOne().sort({ at: -1 }).select("at ok issues").lean(),
    Report.countDocuments({ status: "open" })
  ]);

  // 2. Return clean, formatted tracking states to the admin panel UI layout
  res.json({
    ok: true,
    withdrawalsNeedingAttention: wd,
    topupsNeedingAttention: tu,
    frozenWallets: frozen,
    suspendedMembers: suspended,
    disputesOpen,
    reportsOpen,
    reconciliation: recon ? { at: recon.at, ok: recon.ok, issues: recon.issues } : null
  });
}));

/* ───────── Withdrawals ───────── */
router.get("/withdrawals", h(async (_req, res) => {
  const rows = await Withdrawal.find(stuckWithdrawals()).sort({ createdAt: 1 }).limit(50)
    .select("userId amount phone status failReason originatorConversationId conversationId createdAt").lean();
  res.json({ ok: true, items: await withNames(rows) });
}));

// Large withdrawals: a human approves before any money leaves
router.post("/withdrawals/:id/approve", h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const note = reason(req.body?.note);
  if (!note) throw E("NOTE_REQUIRED");
  const w0 = await Withdrawal.findById(req.params.id).lean();
  if (!w0) throw E("NOT_FOUND", 404);
  if (same(w0.userId, req.user._id)) throw E("CANNOT_RESOLVE_OWN_REQUEST", 403);

  // The status flip is the lock: two admins clicking at once can never send the payout twice
  const claimed = await Withdrawal.findOneAndUpdate(
    { _id: w0._id, status: "AWAITING_APPROVAL" },
    { $set: { status: "PENDING_PAYOUT", approvedBy: req.user._id, approvedAt: new Date() } },
    { new: true }
  );
  if (!claimed) throw E("ALREADY_SETTLED", 409);
  const after = await dispatchPayout(claimed);
  await audit(req, "withdrawal_approve", "withdrawal", w0._id, note, { amount: w0.amount, userId: String(w0.userId) });
  res.json({ ok: true, status: after?.status || claimed.status });
}));

router.post("/withdrawals/:id/reject", h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const note = reason(req.body?.note);
  if (!note) throw E("NOTE_REQUIRED");
  const w0 = await Withdrawal.findById(req.params.id).lean();
  if (!w0) throw E("NOT_FOUND", 404);
  if (w0.status !== "AWAITING_APPROVAL") throw E("ALREADY_SETTLED", 409);
  if (same(w0.userId, req.user._id)) throw E("CANNOT_RESOLVE_OWN_REQUEST", 403);

  const after = await failWithdrawal(w0._id, `Rejected by support: ${note}`); // refunds the wallet exactly once
  if (after?.status !== "FAILED") throw E("ALREADY_SETTLED", 409);
  await notify("PAYOUT_FAILED", w0.userId, { amount: w0.amount });
  await audit(req, "withdrawal_reject", "withdrawal", w0._id, note, { amount: w0.amount, userId: String(w0.userId) });
  res.json({ ok: true });
}));

// body: { action: "paid" | "refund", note, receipt? }
// ONLY after checking the real outcome in the M-Pesa portal. "paid" = the money reached the phone.
router.post("/withdrawals/:id/resolve", h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const { action } = req.body || {};
  const note = reason(req.body?.note);
  if (!note) throw E("NOTE_REQUIRED");
  if (!["paid", "refund"].includes(action)) throw E("INVALID_ACTION");

  const w = await Withdrawal.findById(req.params.id).lean();
  if (!w) throw E("NOT_FOUND", 404);
  if (same(w.userId, req.user._id)) throw E("CANNOT_RESOLVE_OWN_REQUEST", 403);
  if (!["REVIEW", "PENDING_PAYOUT", "SUBMITTED"].includes(w.status)) throw E("ALREADY_SETTLED", 409);

  let after;
  if (action === "paid") {
    const receipt = typeof req.body.receipt === "string" ? req.body.receipt.trim().toUpperCase() : "";
    if (receipt && !RECEIPT_RE.test(receipt)) throw E("INVALID_RECEIPT");
    after = await completeWithdrawal(w._id, receipt || null);
    if (after?.status !== "COMPLETED") throw E("ALREADY_SETTLED", 409);
    await notify("PAYOUT_SENT", w.userId, { amount: w.amount });
  } else {
    after = await failWithdrawal(w._id, `Support: ${note}`); // refunds the wallet exactly once
    if (after?.status !== "FAILED") throw E("ALREADY_SETTLED", 409);
    await notify("PAYOUT_FAILED", w.userId, { amount: w.amount });
  }
  await audit(req, `withdrawal_${action}`, "withdrawal", w._id, note, { amount: w.amount, userId: String(w.userId) });
  res.json({ ok: true, status: after.status });
}));

/* ───────── Top-ups ───────── */
router.get("/topups", h(async (_req, res) => {
  const rows = await MpesaTopUp.find(stuckTopups()).sort({ createdAt: 1 }).limit(50)
    .select("userId amount phone status failReason checkoutRequestId mpesaReceipt createdAt").lean();
  res.json({ ok: true, items: await withNames(rows) });
}));

// body: { action: "credit" | "reject", note, receipt, amount }
// "credit" needs the REAL M-Pesa receipt and the amount actually received, taken from the M-Pesa portal.
router.post("/topups/:id/resolve", h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const { action } = req.body || {};
  const note = reason(req.body?.note);
  if (!note) throw E("NOTE_REQUIRED");
  if (!["credit", "reject"].includes(action)) throw E("INVALID_ACTION");

  const t = await MpesaTopUp.findById(req.params.id).lean();
  if (!t) throw E("NOT_FOUND", 404);
  if (same(t.userId, req.user._id)) throw E("CANNOT_RESOLVE_OWN_REQUEST", 403);
  if (!["REVIEW", "PENDING"].includes(t.status)) throw E("ALREADY_SETTLED", 409);

  if (action === "reject") {
    const r = await MpesaTopUp.updateOne({ _id: t._id, status: { $in: ["REVIEW", "PENDING"] } },
      { $set: { status: "FAILED", failReason: `Support: ${note}` } });
    if (!r.modifiedCount) throw E("ALREADY_SETTLED", 409);
    await audit(req, "topup_reject", "topup", t._id, note, { amount: t.amount });
    return res.json({ ok: true, status: "FAILED" });
  }

  const receipt = typeof req.body.receipt === "string" ? req.body.receipt.trim().toUpperCase() : "";
  const amount = req.body.amount;
  if (!RECEIPT_RE.test(receipt)) throw E("INVALID_RECEIPT");
  if (!Number.isInteger(amount) || amount < 1 || amount > 150000) throw E("INVALID_AMOUNT");

  // The receipt has a unique index, so the same M-Pesa payment can never credit two wallets
  await mongoose.connection.transaction(async (session) => {
   
const flipped = await MpesaTopUp.findOneAndUpdate(
  { _id: t._id, status: { $in: ["REVIEW", "PENDING"] } },
  {
    $set: {
      status: "COMPLETED",
      completedAt: new Date(),
      mpesaReceipt: receipt,
      amount,
    },
  },
  { new: true, session }
);

    if (!flipped) throw E("ALREADY_SETTLED", 409);
    const w = await Wallet.findOneAndUpdate(
      { userId: t.userId },
      { $inc: { balance: amount },
        $push: { transactions: { amount, type: "deposit", status: "COMPLETED", referenceId: receipt,
          description: `M-Pesa top-up of Ksh ${amount.toLocaleString()} (${receipt}), confirmed by support.` } } },
      { session }
    );
    if (!w) throw E("WALLET_MISSING", 500);
  });
  await notify("MPESA_PAYMENT_SUCCESS", t.userId, { amount });
  await audit(req, "topup_credit", "topup", t._id, note, { requested: t.amount, credited: amount, receipt });
  res.json({ ok: true, status: "COMPLETED" });
}));

/* ───────── Members ───────── */
router.get("/users", h(async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 40) : "";
  if (q.length < 2) return res.json({ ok: true, items: [] });
  const rx = new RegExp(escapeRegex(q), "i");

  const profs = await UserProfile.find({ $or: [{ username: rx }, { brandName: rx }, { membershipNumber: rx }, { phoneNumber: rx }, { displayName: rx }] })
    .select("userId username brandName displayName membershipNumber phoneNumber").limit(20).lean();
  const byEmail = await User.findOne({ email: q.toLowerCase() }).select("_id").lean();
  const ids = [...new Set([...profs.map((p) => String(p.userId)), ...(byEmail ? [String(byEmail._id)] : [])])].slice(0, 20);

  const users = await User.find({ _id: { $in: ids } }).select("email role accountCategory membershipStatus isActive").lean();
  const profById = new Map((await UserProfile.find({ userId: { $in: ids } })
    .select("userId username brandName displayName membershipNumber phoneNumber").lean()).map((p) => [String(p.userId), p]));
  res.json({ ok: true, items: users.map((u) => ({ ...u, profile: profById.get(String(u._id)) || {} })) });
}));

router.get("/users/:id", h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const u = await User.findById(req.params.id)
    .select("email role accountCategory membershipStatus membershipExpiresAt plan isActive suspendedAt suspendReason createdAt").lean();
  if (!u) throw E("NOT_FOUND", 404);
  const [profile, wallet, asSeller, asBuyer] = await Promise.all([
    UserProfile.findOne({ userId: u._id }).select("username brandName displayName membershipNumber phoneNumber").lean(),
    Wallet.findOne({ userId: u._id }).select("balance escrowBalance isFrozen").lean(),
    Order.countDocuments({ sellerId: u._id, orderStatus: { $in: ["PROCESSING", "DISPATCHED"] }, isEscrowReleased: false }),
    Order.countDocuments({ buyerId: u._id, orderStatus: { $in: ["PROCESSING", "DISPATCHED"] }, isEscrowReleased: false }),
  ]);
  res.json({ ok: true, user: u, profile: profile || {}, wallet: wallet || {}, openOrders: { asSeller, asBuyer } });
}));

/**
 * Suspend: blocks every signed-in route immediately (the API checks the status on each request),
 * hides their products, and kills their Firebase sessions so they can't sign in again.
 */
router.post("/users/:id/suspend", h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const note = reason(req.body?.note);
  if (!note) throw E("NOTE_REQUIRED");
  if (same(req.params.id, req.user._id)) throw E("CANNOT_SUSPEND_SELF", 403);
  if (same(req.params.id, PLATFORM_ID)) throw E("CANNOT_SUSPEND_PLATFORM", 403);

  const u = await User.findById(req.params.id).select("firebaseUid role membershipStatus").lean();
  if (!u) throw E("NOT_FOUND", 404);
  if (ADMIN_ROLES.includes(u.role)) throw E("CANNOT_SUSPEND_ADMIN", 403);
  if (u.membershipStatus === "suspended") throw E("ALREADY_SUSPENDED", 409);

  // 1. Database first: the block takes effect on the very next request
  const r = await User.updateOne({ _id: u._id, membershipStatus: { $ne: "suspended" } }, {
    $set: { statusBeforeSuspend: u.membershipStatus, membershipStatus: "suspended", commissionEligible: false,
      suspendedAt: new Date(), suspendedBy: req.user._id, suspendReason: note },
  });
  if (!r.modifiedCount) throw E("ALREADY_SUSPENDED", 409);
  await Product.updateMany({ sellerId: u._id, isShelved: true }, { $set: { isShelved: false, hiddenByAdmin: true } });

  // 2. Then Firebase: end every session and block sign-in
  let sessionsRevoked = true;
  try {
    await fbAdmin.auth().revokeRefreshTokens(u.firebaseUid);
    await fbAdmin.auth().updateUser(u.firebaseUid, { disabled: true });
  } catch (e) {
    sessionsRevoked = false;
    console.error("❌ Firebase revoke failed (database block still applies):", e.message);
  }
  await audit(req, "suspend", "user", u._id, note, { sessionsRevoked });
  res.json({ ok: true, sessionsRevoked });
}));

router.post("/users/:id/unsuspend", h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const note = reason(req.body?.note);
  if (!note) throw E("NOTE_REQUIRED");
  const u = await User.findById(req.params.id).select("firebaseUid membershipStatus statusBeforeSuspend membershipExpiresAt").lean();
  if (!u) throw E("NOT_FOUND", 404);
  if (u.membershipStatus !== "suspended") throw E("NOT_SUSPENDED", 409);

  let restore = u.statusBeforeSuspend && u.statusBeforeSuspend !== "suspended" ? u.statusBeforeSuspend : "pending";
  if (restore === "active" && u.membershipExpiresAt && u.membershipExpiresAt <= new Date()) restore = "expired";

  const r = await User.updateOne({ _id: u._id, membershipStatus: "suspended" }, {
    $set: { membershipStatus: restore, suspendedAt: null, suspendedBy: null, suspendReason: "", statusBeforeSuspend: null },
  });
  if (!r.modifiedCount) throw E("NOT_SUSPENDED", 409);
  if (restore === "active") {
    await Product.updateMany({ sellerId: u._id, hiddenByAdmin: true }, { $set: { isShelved: true, hiddenByAdmin: false } });
  } else {
    // still not active: keep the shop hidden until they renew
    await Product.updateMany({ sellerId: u._id, hiddenByAdmin: true }, { $set: { hiddenByAdmin: false, hiddenByExpiry: true } });
  }
  let signInRestored = true;
  try { await fbAdmin.auth().updateUser(u.firebaseUid, { disabled: false }); }
  catch (e) { signInRestored = false; console.error("❌ Firebase re-enable failed:", e.message); }
  await audit(req, "unsuspend", "user", u._id, note, { restoredTo: restore, signInRestored });
  res.json({ ok: true, restoredTo: restore, signInRestored });
}));

// Freeze only the wallet (the member can still sign in): for investigations
router.post("/users/:id/freeze", h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const note = reason(req.body?.note);
  if (!note) throw E("NOTE_REQUIRED");
  if (typeof req.body.frozen !== "boolean") throw E("INVALID_ACTION");
  const r = await Wallet.updateOne({ userId: req.params.id }, { $set: { isFrozen: req.body.frozen } });
  if (!r.matchedCount) throw E("WALLET_NOT_FOUND", 404);
  await audit(req, req.body.frozen ? "freeze_wallet" : "unfreeze_wallet", "user", req.params.id, note);
  res.json({ ok: true, frozen: req.body.frozen });
}));

/* ───────── Orders: refund a buyer when the seller can't finish (for example, suspended) ───────── */
router.post("/orders/:orderNumber/cancel", h(async (req, res) => {
  const note = reason(req.body?.note);
  if (!note) throw E("NOTE_REQUIRED");
  const order = await Order.findOne({ orderNumber: String(req.params.orderNumber).toUpperCase().slice(0, 30) });
  if (!order) throw E("ORDER_NOT_FOUND", 404);

  await mongoose.connection.transaction(async (session) => {
    const c = await Order.findOneAndUpdate(
      { _id: order._id, isEscrowReleased: false, orderStatus: { $in: ["PROCESSING", "DISPATCHED"] } },
      { $set: { orderStatus: "CANCELLED", cancelledAt: new Date() } },
      { session }
    );
    if (!c) throw E("ORDER_NOT_CANCELLABLE", 409);
    await refundEscrowToBuyer(order._id, session);
    for (const it of order.items) {
  await changeStock(session, { productId: it.productId, delta: it.quantity, type: "return", ref: `cancel:${order._id}:${it.productId}`, note: "Order cancelled" });
}
  });
  await notify("ESCROW_REFUNDED", order.buyerId, { orderId: order._id, orderRef: order.orderNumber, amount: order.financials.totalRetailPaid });
  await notify("ORDER_CANCELLED", order.sellerId, { orderId: order._id, orderRef: order.orderNumber });
  await audit(req, "order_cancel", "order", order.orderNumber, note, { amount: order.financials.totalRetailPaid });
  res.json({ ok: true });
}));

/* ───────── Chat reports ───────── */
router.get("/reports", h(async (req, res) => {
  const status = ["open", "dismissed", "actioned"].includes(req.query.status) ? req.query.status : "open";
  const rows = await Report.find({ status }).sort({ createdAt: 1 }).limit(50).select("-__v").lean();
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const counts = await Report.aggregate([
    { $match: { reportedId: { $in: rows.map((r) => r.reportedId) }, createdAt: { $gte: since } } },
    { $group: { _id: "$reportedId", reporters: { $addToSet: "$reporterId" } } },
  ]);
  const countBy = new Map(counts.map((c) => [String(c._id), c.reporters.length]));
  const ids = [...new Set(rows.flatMap((r) => [String(r.reporterId), String(r.reportedId)]))];
  const profs = await UserProfile.find({ userId: { $in: ids } }).select("userId username brandName displayName").lean();
  const nm = new Map(profs.map((p) => [String(p.userId), p.brandName || p.displayName || p.username]));
  res.json({
    ok: true,
    items: rows.map((r) => ({
      ...r,
      reporterName: nm.get(String(r.reporterId)) || String(r.reporterId),
      reportedName: nm.get(String(r.reportedId)) || String(r.reportedId),
      distinctReporters7d: countBy.get(String(r.reportedId)) || 1,
    })),
  });
}));

router.post("/reports/:id/resolve", h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const note = reason(req.body?.note);
  if (!note) throw E("NOTE_REQUIRED");
  if (!["dismissed", "actioned"].includes(req.body?.outcome)) throw E("INVALID_ACTION");
  const r = await Report.findOneAndUpdate(
    { _id: req.params.id, status: "open" },
    { $set: { status: req.body.outcome, resolvedBy: req.user._id, resolvedNote: note, resolvedAt: new Date() } }
  );
  if (!r) throw E("ALREADY_SETTLED", 409);
  await audit(req, `report_${req.body.outcome}`, "report", r._id, note, { reportedId: String(r.reportedId) });
  res.json({ ok: true });
}));
/* ───────── Audit log ───────── */
router.get("/audit", h(async (_req, res) => {
  res.json({ ok: true, items: await AdminAction.find().sort({ createdAt: -1 }).limit(100).select("-__v").lean() });
}));


/* ───────── Disputes ───────── */
router.get("/disputes", h(async (req, res) => {
  const status = ["open", "withdrawn", "refunded", "released"].includes(req.query.status) ? req.query.status : "open";
  const rows = await Dispute.find({ status }).sort({ createdAt: 1 }).limit(50).select("-__v").lean();
  const since = new Date(Date.now() - 90 * 86400000);
  const [byBuyer, bySeller, profs] = await Promise.all([
    Dispute.aggregate([{ $match: { createdAt: { $gte: since }, buyerId: { $in: rows.map((r) => r.buyerId) } } }, { $group: { _id: "$buyerId", n: { $sum: 1 } } }]),
    Dispute.aggregate([{ $match: { createdAt: { $gte: since }, sellerId: { $in: rows.map((r) => r.sellerId) } } }, { $group: { _id: "$sellerId", n: { $sum: 1 } } }]),
    UserProfile.find({ userId: { $in: rows.flatMap((r) => [r.buyerId, r.sellerId]) } }).select("userId username brandName displayName").lean(),
  ]);
  const nm = new Map(profs.map((p) => [String(p.userId), p.brandName || p.displayName || p.username]));
  const nb = new Map(byBuyer.map((x) => [String(x._id), x.n]));
  const ns = new Map(bySeller.map((x) => [String(x._id), x.n]));
  res.json({
    ok: true,
    items: rows.map((r) => ({
      ...r,
      buyerName: nm.get(String(r.buyerId)) || String(r.buyerId),
      sellerName: nm.get(String(r.sellerId)) || String(r.sellerId),
      buyerDisputes90d: nb.get(String(r.buyerId)) || 0,    // a high count can mean abuse
      sellerDisputes90d: ns.get(String(r.sellerId)) || 0,  // a high count can mean a bad seller
    })),
  });
}));

// body: { outcome: "refund" | "release", note }
router.post("/disputes/:id/resolve", h(async (req, res) => {
  if (!isId(req.params.id)) throw E("INVALID_ID");
  const note = reason(req.body?.note);
  if (!note) throw E("NOTE_REQUIRED");
  const outcome = req.body?.outcome;
  if (!["refund", "release"].includes(outcome)) throw E("INVALID_ACTION");

  const d0 = await Dispute.findById(req.params.id).lean();
  if (!d0) throw E("NOT_FOUND", 404);
  if (same(d0.buyerId, req.user._id) || same(d0.sellerId, req.user._id)) throw E("CANNOT_RESOLVE_OWN_REQUEST", 403);

  await mongoose.connection.transaction(async (session) => {
    const d = await Dispute.findOneAndUpdate(
      { _id: d0._id, status: "open" },
      { $set: { status: outcome === "refund" ? "refunded" : "released", resolution: { by: req.user._id, note, at: new Date() } },
        $push: { messages: { by: "admin", userId: req.user._id, text: `Decision: ${outcome === "refund" ? "refund to the buyer" : "release to the seller"}. ${note}`.slice(0, 1000), images: [], createdAt: new Date() } } },
      { session }
    );
    if (!d) throw E("ALREADY_SETTLED", 409);
    const set = outcome === "refund"
      ? { orderStatus: "CANCELLED", cancelledAt: new Date(), cancelReason: "DISPUTE_REFUND" }
      : { orderStatus: "DELIVERED", isEscrowReleased: true, deliveredAt: new Date(), settledBy: "admin" };
    const o = await Order.findOneAndUpdate({ _id: d0.orderId, orderStatus: "DISPUTED", isEscrowReleased: false }, { $set: set }, { session });
    if (!o) throw E("ORDER_NOT_DISPUTED", 409);
    if (outcome === "refund") await refundEscrowToBuyer(o._id, session); // no automatic restock: the item may have shipped
    else await releaseEscrowToVendor(o._id, session);
  });

  const ctx = { orderId: d0.orderId, orderRef: d0.orderNumber, amount: d0.amount, outcome };
  await notify("DISPUTE_RESOLVED", d0.buyerId, { ...ctx, audience: "buyer" });
  await notify("DISPUTE_RESOLVED", d0.sellerId, { ...ctx, audience: "seller" });
  await audit(req, `dispute_${outcome}`, "dispute", d0._id, note, { order: d0.orderNumber, amount: d0.amount });
  res.json({ ok: true });
}));





module.exports = router;
