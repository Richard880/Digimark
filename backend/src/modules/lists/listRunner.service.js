const crypto = require("crypto");
const ShoppingList = require("../../models/ShoppingList");
const { placeOrder } = require("../order/order.controller");
const { notify } = require("../../services/notification.service");
const { review, addCycle } = require("./lists.service");

const H = 3600 * 1000;
const ago = (ms) => new Date(Date.now() - ms);
const ahead = (ms) => new Date(Date.now() + ms);
const keyFor = (l, itemId) => crypto.createHash("sha256").update(`${l._id}:${l.cycle}:${itemId}`).digest("hex").slice(0, 40);
const fmtWhen = (d) => new Date(d).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });

async function precheck(l) {
  const rv = await review(l);
  if (!rv.rows.some((r) => r.status === "ok")) return notify("LIST_ACTION_NEEDED", l.buyerId, { listName: l.name, reason: "nothing" });
  await notify("LIST_UPCOMING", l.buyerId, { listName: l.name, total: rv.total, short: rv.short });
}

async function place(l) {
  const lateBy = new Date(l.deliveryAt).getTime() - Date.now();
  const needsCheck = async (reason) => {
    await ShoppingList.updateOne({ _id: l._id }, { $set: { status: "needs_review", reason, leaseUntil: null } });
    await notify("LIST_ACTION_NEEDED", l.buyerId, { listName: l.name, reason });
  };
  const advance = (extra = {}) => ShoppingList.updateOne({ _id: l._id }, l.repeat === "none"
    ? { $set: { status: "done", leaseUntil: null, ...extra } }
    : { $set: { deliveryAt: addCycle(l.deliveryAt, l.repeat), precheckedFor: null, leaseUntil: null, ...extra }, $inc: { cycle: 1 } });

  if (lateBy < 6 * H) { // too late to deliver on time
    if (l.repeat === "none") return needsCheck("missed");
    await advance(); await notify("LIST_ACTION_NEEDED", l.buyerId, { listName: l.name, reason: "missed" });
    return;
  }

  const rv = await review(l);
  const ok = rv.rows.filter((r) => r.status === "ok");
  const skipped = rv.rows.filter((r) => r.status !== "ok").map((r) => ({ name: r.name, reason: r.status }));
  if (!ok.length) return needsCheck("nothing");
  if (rv.wallet.frozen || rv.wallet.balance < rv.total) return needsCheck("funds"); // nothing is ordered; the buyer checks the list again

  const placed = [];
  for (const r of ok) {
    try {
      const out = await placeOrder({
        buyerId: l.buyerId, productId: r.productId, quantity: r.quantity, idempotencyKey: keyFor(l, r.itemId), scheduledFor: new Date(l.deliveryAt),
        shippingDetails: { ...l.address, deliveryNotes: `Scheduled for ${fmtWhen(l.deliveryAt)}. ${l.address.deliveryNotes || ""}`.trim().slice(0, 300) },
      });
      placed.push({ name: r.name, orderNumber: out.order.orderNumber, amount: out.order.totalAmountLocked });
    } catch (e) { skipped.push({ name: r.name, reason: String(e.code || e.message || "FAILED").slice(0, 40) }); }
  }
  if (!placed.length) return needsCheck("nothing");
  await advance({ lastRun: { at: new Date(), placed, skipped }, reason: skipped.length ? "items_skipped" : "" });
  await notify("LIST_PLACED", l.buyerId, { listName: l.name, placed: placed.length, skipped: skipped.length });
}

async function runLists(budgetMs = 8000) {
  const end = Date.now() + budgetMs;
  const stats = { prechecked: 0, placed: 0, errors: 0 };

  // 1. A heads-up between 48 and 24 hours before delivery
  const preFilter = () => ({ status: "active", deliveryAt: { $lte: ahead(48 * H), $gt: ahead(24 * H) }, $expr: { $ne: ["$precheckedFor", "$deliveryAt"] } });
  for (const c of await ShoppingList.find(preFilter()).limit(100).lean()) {
    if (Date.now() > end) break;
    try {
      const claimed = await ShoppingList.updateOne({ _id: c._id, ...preFilter() }, { $set: { precheckedFor: c.deliveryAt } });
      if (claimed.modifiedCount) { await precheck(c); stats.prechecked++; }
    } catch (e) { stats.errors++; console.error("❌ list precheck:", e.message); }
  }

  // 2. Order at 24 hours before. The lease means two overlapping runs can't both process a list.
  const dueFilter = () => ({ status: "active", deliveryAt: { $lte: ahead(24 * H) }, $or: [{ leaseUntil: null }, { leaseUntil: { $lt: new Date() } }] });
  while (Date.now() < end) {
    const l = await ShoppingList.findOneAndUpdate(dueFilter(), { $set: { leaseUntil: ahead(5 * 60 * 1000) } }, { new: true, sort: { deliveryAt: 1 } }).lean();
    if (!l) break;
    try { await place(l); stats.placed++; }
    catch (e) { stats.errors++; console.error("❌ list place:", l._id, e.stack || e.message); } // the lease expires and it is retried safely
  }
  return stats;
}

module.exports = { runLists };
