const mongoose = require("mongoose");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const { refundEscrowToBuyer, releaseEscrowToVendor } = require("../wallet/escrow.service");
const { notify } = require("../../services/notification.service");
const C = require("../config/orders");

const BATCH = 40;
const H = 3600 * 1000, D = 24 * H;
const ago = (ms) => new Date(Date.now() - ms);

// Each step flips the order's status inside ONE transaction with the money movement,
// so a crash can't leave an order cancelled without a refund, and two runs can't both pay.
async function cancelOne(id) {
  const order = await mongoose.connection.transaction(async (session) => {
    const o = await Order.findOneAndUpdate(
      { _id: id, orderStatus: "PROCESSING", isEscrowReleased: false, createdAt: { $lte: ago(C.CONFIRM_WINDOW_MS) } },
      { $set: { orderStatus: "CANCELLED", cancelledAt: new Date(), cancelReason: "AUTO_SELLER_NO_CONFIRM" } },
      { session }
    );
    if (!o) return null;
    await refundEscrowToBuyer(o._id, session);
    for (const it of o.items) await Product.updateOne({ _id: it.productId }, { $inc: { quantity: it.quantity } }, { session });
    return o;
  });
  if (!order) return false;
  const ctx = { orderId: order._id, orderRef: order.orderNumber, amount: order.financials.totalRetailPaid };
  await notify("ORDER_AUTO_CANCELLED_BUYER", order.buyerId, ctx);
  await notify("ORDER_AUTO_CANCELLED_SELLER", order.sellerId, ctx);
  return true;
}

async function releaseOne(id) {
  const order = await mongoose.connection.transaction(async (session) => {
    const o = await Order.findOneAndUpdate(
      { _id: id, orderStatus: "DISPATCHED", isEscrowReleased: false, dispatchedAt: { $lte: ago(C.PROTECTION_MS) } },
      { $set: { orderStatus: "DELIVERED", isEscrowReleased: true, deliveredAt: new Date(), settledBy: "auto" } },
      { session }
    );
    if (!o) return null;
    await releaseEscrowToVendor(o._id, session); // pays vendor, promoter and platform
    return o;
  });
  if (!order) return false;
  const f = order.financials;
  const ctx = { orderId: order._id, orderRef: order.orderNumber };
  await notify("ESCROW_RELEASED", order.sellerId, { ...ctx, amount: f.totalWholesaleToShop });
  await notify("ORDER_AUTO_RELEASED_BUYER", order.buyerId, ctx);
  if (order.promoterId && f.totalCommissionSplit > 0) await notify("PROMOTER_BONUS", order.promoterId, { ...ctx, amount: f.totalCommissionSplit });
  return true;
}

// Works through matching orders in batches until none are left or the time budget runs out
async function drain(find, handle, endAt, stats, key) {
  const skip = [];
  while (Date.now() < endAt) {
    const rows = await find(skip).limit(BATCH).select("_id").lean();
    if (!rows.length) return true;
    for (const r of rows) {
      if (Date.now() >= endAt) return false;
      try {
        if (await handle(r._id)) stats[key]++;
        else skip.push(r._id);
      } catch (e) {
        stats.errors++;
        skip.push(r._id); // don't loop on an order that keeps failing; it's retried next run
        console.error(`❌ order timer ${key} ${r._id}:`, e.message);
      }
    }
  }
  return false;
}

const REMINDERS = [
  {
    stat: "confirm", field: "reminders.confirm", event: "SELLER_CONFIRM_REMINDER", to: "sellerId",
    match: () => ({ orderStatus: "PROCESSING", createdAt: { $lte: ago(C.CONFIRM_REMIND_AFTER_MS), $gt: ago(C.CONFIRM_WINDOW_MS) } }),
    ctx: (o) => ({ hours: Math.max(1, Math.round((new Date(o.createdAt).getTime() + C.CONFIRM_WINDOW_MS - Date.now()) / H)) }),
  },
  {
    stat: "deliver1", field: "reminders.deliver1", event: "BUYER_DELIVERY_REMINDER", to: "buyerId",
    match: () => ({ orderStatus: "DISPATCHED", dispatchedAt: { $lte: ago(C.REMIND1_AFTER_MS), $gt: ago(C.REMIND2_AFTER_MS) } }),
    ctx: (o) => ({ days: Math.max(1, Math.ceil((new Date(o.dispatchedAt).getTime() + C.PROTECTION_MS - Date.now()) / D)) }),
  },
  {
    stat: "deliver2", field: "reminders.deliver2", event: "BUYER_DELIVERY_REMINDER", to: "buyerId", also: { event: "SELLER_AUTORELEASE_NOTICE", to: "sellerId" },
    match: () => ({ orderStatus: "DISPATCHED", dispatchedAt: { $lte: ago(C.REMIND2_AFTER_MS), $gt: ago(C.PROTECTION_MS) } }),
    ctx: () => ({ days: 1 }),
  },
];

const remindPhase = (spec, endAt, stats) =>
  drain(
    (skip) => Order.find({ ...spec.match(), isEscrowReleased: false, [spec.field]: null, _id: { $nin: skip } }),
    async (id) => {
      // The marker is claimed atomically, so two overlapping runs never send the same reminder twice
      const o = await Order.findOneAndUpdate(
        { _id: id, ...spec.match(), [spec.field]: null },
        { $set: { [spec.field]: new Date() } },
        { projection: { buyerId: 1, sellerId: 1, orderNumber: 1, createdAt: 1, dispatchedAt: 1 } }
      );
      if (!o) return false;
      const ctx = { orderId: o._id, orderRef: o.orderNumber, ...spec.ctx(o) };
      await notify(spec.event, o[spec.to], ctx);
      if (spec.also) await notify(spec.also.event, o[spec.also.to], ctx);
      return true;
    },
    endAt, stats, spec.stat
  );

async function runOrderTimers(budgetMs = 8000) {
  const stats = { cancelled: 0, released: 0, confirm: 0, deliver1: 0, deliver2: 0, errors: 0 };
  const slice = Math.floor(budgetMs / 5);
  let finished = true;

  finished = (await drain(
    (skip) => Order.find({ orderStatus: "PROCESSING", isEscrowReleased: false, createdAt: { $lte: ago(C.CONFIRM_WINDOW_MS) }, _id: { $nin: skip } }),
    cancelOne, Date.now() + slice, stats, "cancelled"
  )) && finished;

  finished = (await drain(
    (skip) => Order.find({ orderStatus: "DISPATCHED", isEscrowReleased: false, dispatchedAt: { $lte: ago(C.PROTECTION_MS) }, _id: { $nin: skip } }),
    releaseOne, Date.now() + slice, stats, "released"
  )) && finished;

  for (const spec of REMINDERS) finished = (await remindPhase(spec, Date.now() + slice, stats)) && finished;
  return { ...stats, finished };
}

module.exports = { runOrderTimers };
