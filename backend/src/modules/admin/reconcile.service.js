const Wallet = require("../../models/Wallet");
const MpesaTopUp = require("../../models/MpesaTopUp");
const Withdrawal = require("../../models/Withdrawal");
const EscrowAccount = require("../../models/EscrowAccount");
const Order = require("../../models/Order");
const Dispute = require("../../models/Dispute");
const ReconciliationRun = require("../../models/ReconciliationRun");
const { notifyAdmins } = require("../../services/notification.service");
const C = require("../../config/orders");

const H = 3600 * 1000, D = 24 * H;
const total = (rows, k = "total") => rows[0]?.[k] || 0;
const kes = (n) => `Ksh ${Number(n).toLocaleString("en-KE")}`;

async function runReconciliation() {
  const now = Date.now();
  const [w, dep, out, held, negative, lateConfirm, lateRelease, oldDisputes] = await Promise.all([
    Wallet.aggregate([{ $group: { _id: null, balance: { $sum: "$balance" }, escrow: { $sum: "$escrowBalance" } } }]),
    MpesaTopUp.aggregate([{ $match: { status: "COMPLETED" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    Withdrawal.aggregate([{ $match: { status: { $in: ["AWAITING_APPROVAL", "PENDING_PAYOUT", "SUBMITTED", "COMPLETED", "REVIEW"] } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    EscrowAccount.aggregate([{ $match: { status: "SECURED" } }, { $group: { _id: null, total: { $sum: "$totalAmountHeld" } } }]),
    Wallet.countDocuments({ $or: [{ balance: { $lt: 0 } }, { escrowBalance: { $lt: 0 } }] }),
    Order.countDocuments({ orderStatus: "PROCESSING", createdAt: { $lt: new Date(now - C.CONFIRM_WINDOW_MS - 3 * H) } }),
    Order.countDocuments({ orderStatus: "DISPATCHED", dispatchedAt: { $lt: new Date(now - C.PROTECTION_MS - 3 * H) } }),
    Dispute.countDocuments({ status: "open", createdAt: { $lt: new Date(now - 3 * D) } }),
  ]);

  const walletsTotal = total(w, "balance") + total(w, "escrow");
  const expected = total(dep) - total(out);
  const escrowWallets = total(w, "escrow");
  const escrowHeld = total(held);

  const issues = [];
  const crit = (code, detail) => issues.push({ code, severity: "critical", detail });
  const warn = (code, detail) => issues.push({ code, severity: "warning", detail });
  if (walletsTotal !== expected) crit("MONEY_MISMATCH", `Wallets and escrow hold ${kes(walletsTotal)}, but deposits minus withdrawals is ${kes(expected)} (difference ${kes(walletsTotal - expected)}).`);
  if (escrowWallets !== escrowHeld) crit("ESCROW_MISMATCH", `Buyers' escrow balances total ${kes(escrowWallets)}, but open escrow records total ${kes(escrowHeld)}.`);
  if (negative) crit("NEGATIVE_BALANCE", `${negative} wallet(s) have a negative balance.`);
  if (lateConfirm) warn("TIMER_BACKLOG_CONFIRM", `${lateConfirm} unconfirmed order(s) are past their cancel deadline. Is the hourly job running?`);
  if (lateRelease) warn("TIMER_BACKLOG_RELEASE", `${lateRelease} dispatched order(s) are past their auto-release date. Is the hourly job running?`);
  if (oldDisputes) warn("OLD_DISPUTES", `${oldDisputes} dispute(s) have been open for more than 3 days.`);

  const ok = !issues.some((i) => i.severity === "critical");
  const run = await ReconciliationRun.create({
    ok, issues,
    figures: { walletsTotal, expected, escrowWallets, escrowHeld, deposits: total(dep), withdrawals: total(out) },
  });
  if (!ok) {
    console.error("🚨 RECONCILIATION FAILED:", JSON.stringify(issues));
    await notifyAdmins(`Money check failed: ${issues.find((i) => i.severity === "critical").detail}`);
  }
  return { ok, issues, at: run.at };
}

module.exports = { runReconciliation };
