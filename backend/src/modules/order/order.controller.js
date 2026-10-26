const mongoose = require("mongoose");
const crypto = require("crypto");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const ShareLink = require("../../models/ShareLink");
const { notify } = require("../../services/notification.service");
const User = require("../../models/User");
const C = require("../config/orders");


const {
  holdOrderFunds,
  releaseEscrowToVendor,
  refundEscrowToBuyer,
  EscrowError,
} = require("../wallet/escrow.service");

const MAX_QTY = 100;
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;
const STATUSES = ["PENDING_PAYMENT", "PROCESSING", "DISPATCHED", "DISPUTED", "DELIVERED", "CANCELLED"];
const OPEN = ["PROCESSING", "DISPATCHED"];

const fail = (code, status = 400, extra) => new EscrowError(code, status, extra);
const isId = (v) => typeof v === "string" && /^[a-f\d]{24}$/i.test(v);
const isStr = (v, max = 100) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const same = (a, b) => String(a) === String(b);

function sendError(res, err, tag) {
  if (err instanceof EscrowError) {
    const body = { error: err.code };
    if (err.currentBalance !== undefined) {
      body.currentBalance = err.currentBalance;
      body.deficit = err.deficit;
    }
    return res.status(err.status).json(body);
  }
  console.error(`❌ ${tag}:`, err.stack || err.message); // log details, never send them
  return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
}


// is only accepted if they actually shared THIS product (see design: unique share pin/url).
// A promoter counts only if THEY created a share link for THIS product
async function resolvePromoter(shareCode, productId, buyerId) {
  if (typeof shareCode !== "string" || !/^[A-Za-z0-9_-]{8,32}$/.test(shareCode)) return null;
  const link = await ShareLink.findOne({ code: shareCode, productId }).lean();
  if (!link || same(link.promoterId, buyerId)) return null;
  return link.promoterId;
}


const withDeadlines = (o) => {
  const t = (d, ms) => (d ? new Date(new Date(d).getTime() + ms) : null);
  return {
    ...o,
    deadlines: {
      confirmBy: o.orderStatus === "PROCESSING" ? t(o.createdAt, C.CONFIRM_WINDOW_MS) : null,
      autoReleaseAt: o.orderStatus === "DISPATCHED" ? t(o.dispatchedAt, C.PROTECTION_MS) : null,
      sellerDisputeAt: o.orderStatus === "DISPATCHED" ? t(o.dispatchedAt, C.SELLER_DISPUTE_AFTER_MS) : null,
    },
  };
};
// then:  const safe = orders.map(withDeadlines).map((o) => same(o.buyerId, me) || same(o.sellerId, me) ? o : { ...o, shippingDetails: undefined, buyerId: undefined });
/** GET /api/orders : orders where I am buyer, seller or promoter */
async function listOrders(req, res) {
  try {
    const me = req.user?._id;
    if (!me) return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });

    const role = req.query.role;
    const filter = role === "seller" ? { sellerId: me }
      : role === "buyer" ? { buyerId: me }
      : { $or: [{ buyerId: me }, { sellerId: me }, { promoterId: me }] };
    
    const { status } = req.query;
    if (typeof status === "string" && STATUSES.includes(status)) filter.orderStatus = status;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

    // PIN fields are select:false, so they can never appear here
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Promoters only see sale info, never the buyer's address or phone
    const safe = orders.map((o) =>
  same(o.buyerId, me) || same(o.sellerId, me) ? o : { ...o, shippingDetails: undefined, buyerId: undefined }
);
    return res.status(200).json(safe);
  } catch (err) {
    return sendError(res, err, "listOrders");
  }
}

/** POST /api/orders : price & stock from DB, funds -> escrow, all-or-nothing */
async function createOrder(req, res) {
  let idemKey = null;
  
    // ...the rest of your existing code, unchanged...
 try {
    const buyerId = req.user?._id;
    if (!buyerId) return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });

    idemKey = req.get("Idempotency-Key");
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(idemKey || "")) throw fail("IDEMPOTENCY_KEY_REQUIRED");
    const prior = await Order.findOne({ buyerId, idempotencyKey: idemKey }).select("+escrowReleasePin orderNumber financials");
    if (prior) {
      return res.status(200).json({ ok: true, replay: true, order: { orderNumber: prior.orderNumber, totalAmountLocked: prior.financials.totalRetailPaid, deliveryReleasePin: prior.escrowReleasePin } });
    }
   
   const { productId, shareCode, shippingDetails: sd } = req.body || {};
    
  const quantity = req.body?.quantity === undefined ? 1 : req.body.quantity;

    if (!isId(productId)) throw fail("INVALID_PRODUCT_ID");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) throw fail("INVALID_QUANTITY");
    if (!sd || !isStr(sd.fullName, 80) || !/^\+?\d{9,15}$/.test(String(sd.phoneNumber || "")) ||
        !isStr(sd.county, 40) || !isStr(sd.subCounty, 40)) {
      throw fail("SHIPPING_DETAILS_INVALID");
    }
    const promoter = await resolvePromoter(shareCode, productId, buyerId);

       const order = await mongoose.connection.transaction(async (session) => {
      // Atomic stock reservation: check + decrement in ONE operation (no oversell race).
      // Only listed, shelved products can be bought.
      const product = await Product.findOneAndUpdate(
        {
          _id: productId,
          quantity: { $gte: quantity },
          status: { $in: ["LISTED", "ACTIVE"] },
          isShelved: true,
        },
        { $inc: { quantity: -quantity } },
        { new: true, session }
      );

      if (!product) {
        const p = await Product.findOne({ _id: productId }).select("status isShelved").session(session).lean();
        const visible = p && p.isShelved === true && ["LISTED", "ACTIVE"].includes(p.status);
        throw visible ? fail("INSUFFICIENT_STOCK", 409) : fail("PRODUCT_NOT_FOUND", 404);
      }

      // The seller must still have a live membership (a second guard on top of the daily expiry job)
      const live = await User.exists({
        _id: product.sellerId || product.merchantId,
        membershipStatus: "active",
        isActive: true,
        $or: [{ membershipExpiresAt: null }, { membershipExpiresAt: { $gt: new Date() } }],
      }).session(session);
      if (!live) throw fail("PRODUCT_NOT_FOUND", 404); // rolls the stock reservation back too

      const sellerId = product.sellerId || product.merchantId;
      const delivery = product.deliveryFee || 0;
      if (!sellerId) throw fail("PRODUCT_HAS_NO_SELLER", 500);
      if (!Number.isSafeInteger(product.price) || product.price <= 0 ||
          !Number.isSafeInteger(delivery) || delivery < 0) throw fail("PRODUCT_PRICE_INVALID", 500);

      const amount = product.price * quantity + delivery;
      const orderId = new mongoose.Types.ObjectId();

      // Single source of truth for fees: the escrow service
      const hold = await holdOrderFunds(
       { orderId, buyerId, vendorId: sellerId, affiliateId: promoter, amount, feeBase: product.price * quantity },
        session
      );

      const [created] = await Order.create(
        [{
          _id: orderId,
          buyerId,
          sellerId,
          promoterId: hold.affiliateId || null,
          items: [{
            productId: product._id,
            name: product.name,
            quantity,
            pricePaid: product.price,
            commissionAllocated: hold.affiliateBonus,
          }],
          shippingDetails: {
            fullName: sd.fullName.trim(),
            phoneNumber: sd.phoneNumber,
            county: sd.county.trim(),
            subCounty: sd.subCounty.trim(),
            deliveryNotes: isStr(sd.deliveryNotes, 300) ? sd.deliveryNotes.trim() : "",
          },
          financials: {
            totalRetailPaid: amount,
            totalWholesaleToShop: hold.vendorNet,
            totalCommissionSplit: hold.affiliateBonus,
            platformFee: hold.platformFee,
            deliveryFeePaid: delivery,
          },
          orderStatus: "PROCESSING", // safe: funds are held in this same transaction
          idempotencyKey: idemKey
        }],
      
        { session }
      );
      return created;
    });

    const ctx = { orderId: order._id, orderRef: order.orderNumber, amount: order.financials.totalRetailPaid };
      await notify("ORDER_PLACED", order.sellerId, ctx, { actorId: buyerId });
      await notify("ESCROW_FUNDED", order.sellerId, ctx, { actorId: buyerId });

    return res.status(201).json({
      ok: true,
      order: {
        orderNumber: order.orderNumber,
        totalAmountLocked: order.financials.totalRetailPaid,
        deliveryReleasePin: order.escrowReleasePin, // shown to the buyer only
      },
    });
    } catch (err) {
    if (err.code === 11000 && idemKey) { // two identical requests arrived at once: the second one is rolled back, so return the first
      const prior = await Order.findOne({ buyerId: req.user._id, idempotencyKey: idemKey }).select("+escrowReleasePin orderNumber financials");
      if (prior) return res.status(200).json({ ok: true, replay: true, order: { orderNumber: prior.orderNumber, totalAmountLocked: prior.financials.totalRetailPaid, deliveryReleasePin: prior.escrowReleasePin } });
    }
    return sendError(res, err, "createOrder");
  }
}

/** GET /api/orders/:orderNumber/pin : buyer only */
async function getDeliveryPin(req, res) {
  try {
    const buyerId = req.user?._id;
    if (!buyerId) return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    const { orderNumber } = req.params;
    if (!isStr(orderNumber, 30)) throw fail("INVALID_ORDER_NUMBER");

    const order = await Order.findOne({
      orderNumber: orderNumber.toUpperCase(),
      buyerId,
      isEscrowReleased: false,
      orderStatus: { $in: OPEN },
    }).select("+escrowReleasePin orderNumber");
    if (!order) throw fail("ORDER_NOT_FOUND", 404);

    return res.json({
      ok: true,
      pin: order.escrowReleasePin,
      qrPayload: `sokodigi:order:${order.orderNumber}:${order.escrowReleasePin}`,
    });
  } catch (err) {
    return sendError(res, err, "getDeliveryPin");
  }
}

/**
 * Seller confirms delivery with the buyer's PIN or scanned QR.
 * ONE handler for every release route (orderNumber from params or body).
 */
async function completeDelivery(req, res) {
  try {
    const sellerId = req.user?._id;
    if (!sellerId) return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });

    const orderNumber = req.params?.orderNumber ?? req.body?.orderNumber;
    const { pin, qrToken, providedPin } = req.body || {};
    if (!isStr(orderNumber, 30)) throw fail("INVALID_ORDER_NUMBER");

    let submitted = null;
    const rawPin = pin ?? providedPin;
    if (typeof rawPin === "string") {
      submitted = rawPin.trim();
    } else if (typeof qrToken === "string") {
      const m = /^sokodigi:order:([A-Za-z0-9-]{1,30}):(\d{6})$/.exec(qrToken.trim());
      if (!m || m[1].toUpperCase() !== orderNumber.toUpperCase()) throw fail("INVALID_QR", 422);
      submitted = m[2];
    }
    if (!/^\d{6}$/.test(submitted || "")) throw fail("INVALID_PIN_FORMAT");

    // Only this order's seller can find it; anyone else just gets "not found"
    const order = await Order.findOne({ orderNumber: orderNumber.toUpperCase(), sellerId })
      .select("+escrowReleasePin +pinAttempts +pinLockedUntil");
    if (!order) throw fail("ORDER_NOT_FOUND", 404);
    if (order.isEscrowReleased || order.orderStatus === "DELIVERED") throw fail("ALREADY_FULFILLED", 409);
    if (!OPEN.includes(order.orderStatus)) throw fail("ORDER_NOT_DELIVERABLE", 409);
    if (order.pinLockedUntil && order.pinLockedUntil > new Date()) throw fail("TOO_MANY_ATTEMPTS", 429);

    const a = Buffer.from(submitted);
    const b = Buffer.from(order.escrowReleasePin);
    if (!(a.length === b.length && crypto.timingSafeEqual(a, b))) {
      // Runs OUTSIDE the transaction so the failed attempt is always recorded
      const u = await Order.findOneAndUpdate({ _id: order._id }, { $inc: { pinAttempts: 1 } }, { new: true })
        .select("+pinAttempts");
      if (u.pinAttempts >= MAX_PIN_ATTEMPTS) {
        await Order.updateOne({ _id: order._id },
          { $set: { pinAttempts: 0, pinLockedUntil: new Date(Date.now() + PIN_LOCK_MS) } });
      }
      throw fail("INVALID_RELEASE_PIN", 422);
    }

    const result = await mongoose.connection.transaction(async (session) => {
      // The status flip is the lock: only one request can ever win this
      const claimed = await Order.findOneAndUpdate(
        { _id: order._id, isEscrowReleased: false, orderStatus: { $in: OPEN } },
        { $set: { orderStatus: "DELIVERED", isEscrowReleased: true, deliveredAt: new Date(), pinAttempts: 0, settledBy: "pin" } },
        { session }
      );
      if (!claimed) throw fail("ALREADY_FULFILLED", 409);
      return releaseEscrowToVendor(order._id, session); // pays vendor + promoter + platform
    });

    const f = order.financials;
const ctx = { orderId: order._id, orderRef: order.orderNumber };
await notify("ESCROW_RELEASED", order.sellerId, { ...ctx, amount: f.totalWholesaleToShop }, { actorId: sellerId, includeActor: true });
await notify("ORDER_COMPLETED", order.buyerId, ctx, { actorId: sellerId });
if (order.promoterId && f.totalCommissionSplit > 0) await notify("PROMOTER_BONUS", order.promoterId, { ...ctx, amount: f.totalCommissionSplit });

    return res.status(200).json({ ok: true, status: "DELIVERED", releasedToVendor: result.releasedToVendor });
  } catch (err) {
    return sendError(res, err, "completeDelivery");
  }
}

/** PATCH /api/orders/:orderNumber/cancel : seller (until delivered) or buyer (before dispatch) */
async function cancelOrder(req, res) {
  try {
    const me = req.user?._id;
    if (!me) return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    const { orderNumber } = req.params;
    if (!isStr(orderNumber, 30)) throw fail("INVALID_ORDER_NUMBER");

    const order = await Order.findOne({
      orderNumber: orderNumber.toUpperCase(),
      $or: [{ buyerId: me }, { sellerId: me }],
    });
    if (!order) throw fail("ORDER_NOT_FOUND", 404);

    const allowed = same(order.sellerId, me) ? OPEN : ["PROCESSING"];
    await mongoose.connection.transaction(async (session) => {
      const claimed = await Order.findOneAndUpdate(
        { _id: order._id, isEscrowReleased: false, orderStatus: { $in: allowed } },
        { $set: { orderStatus: "CANCELLED", cancelledAt: new Date() } },
        { session }
      );
      if (!claimed) throw fail("ORDER_NOT_CANCELLABLE", 409);
      await refundEscrowToBuyer(order._id, session);
      for (const it of order.items) {
        await Product.updateOne({ _id: it.productId }, { $inc: { quantity: it.quantity } }, { session });
      }
    });
    
    const other = same(order.sellerId, me) ? order.buyerId : order.sellerId;
await notify("ORDER_CANCELLED", other, { orderId: order._id, orderRef: order.orderNumber }, { actorId: me });
await notify("ESCROW_REFUNDED", order.buyerId, { orderId: order._id, orderRef: order.orderNumber, amount: order.financials.totalRetailPaid }, { includeActor: true });
    
    return res.json({ ok: true, status: "CANCELLED" });
  } catch (err) {
    return sendError(res, err, "cancelOrder");
  }
}

/** PATCH /api/orders/:orderNumber/confirm : seller confirms the order and releases it for delivery */
async function confirmOrder(req, res) {
  try {
    const sellerId = req.user?._id;
    if (!sellerId) return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    const { orderNumber } = req.params;
    if (!isStr(orderNumber, 30)) throw fail("INVALID_ORDER_NUMBER");
    const ref = orderNumber.toUpperCase();

    // The status flip is the lock: it can only happen once
    const o = await Order.findOneAndUpdate(
      { orderNumber: ref, sellerId, orderStatus: "PROCESSING", isEscrowReleased: false },
      { $set: { orderStatus: "DISPATCHED", dispatchedAt: new Date() } },
      { new: true }
    ).select("buyerId orderNumber");
    if (!o) throw (await Order.exists({ orderNumber: ref, sellerId })) ? fail("ORDER_NOT_CONFIRMABLE", 409) : fail("ORDER_NOT_FOUND", 404);

    await notify("ORDER_DISPATCHED", o.buyerId, { orderId: o._id, orderRef: o.orderNumber }, { actorId: sellerId });
    return res.json({ ok: true, status: "DISPATCHED" });
  } catch (err) {
    return sendError(res, err, "confirmOrder");
  }
}

module.exports = {
  listOrders,
  createOrder,
  getDeliveryPin,
  completeDelivery,
  cancelOrder,
  confirmOrder,
  // Old names kept so your existing routes keep working. All use the same safe handler.
  releaseEscrowViaQrScan: completeDelivery,
  releaseEscrowViaPinVerification: completeDelivery,
  fulfillOrderEscrowHandshake: completeDelivery,
};
