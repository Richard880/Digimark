const mongoose = require("mongoose");
const crypto = require("crypto");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const User = require("../../models/User");
const {
  holdOrderFunds,
  releaseEscrowToVendor,
  refundEscrowToBuyer,
  EscrowError,
} = require("../wallet/escrow.service");

const MAX_QTY = 100;
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;
const STATUSES = ["PENDING_PAYMENT", "PROCESSING", "DISPATCHED", "DELIVERED", "CANCELLED"];
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

// TODO: replace with a real check against your share-link records, so a promoter
// is only accepted if they actually shared THIS product (see design: unique share pin/url).
async function resolvePromoter(promoterId, buyerId) {
  if (!isId(promoterId) || same(promoterId, buyerId)) return null;
  return (await User.exists({ _id: promoterId })) ? promoterId : null;
}

/** GET /api/orders : orders where I am buyer, seller or promoter */
async function listOrders(req, res) {
  try {
    const me = req.user?._id;
    if (!me) return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });

    const filter = { $or: [{ buyerId: me }, { sellerId: me }, { promoterId: me }] };
    const { status } = req.query;
    if (typeof status === "string" && STATUSES.includes(status)) filter.orderStatus = status;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

    // PIN fields are select:false, so they can never appear here
    const orders = await Order.find(filter)
      .populate("buyerId", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Promoters only see sale info, never the buyer's address or phone
    const safe = orders.map((o) =>
      !same(o.buyerId?._id ?? o.buyerId, me) && !same(o.sellerId, me)
        ? { ...o, shippingDetails: undefined, buyerId: undefined }
        : o
    );
    return res.status(200).json(safe);
  } catch (err) {
    return sendError(res, err, "listOrders");
  }
}

/** POST /api/orders : price & stock from DB, funds -> escrow, all-or-nothing */
async function createOrder(req, res) {
  try {
    const buyerId = req.user?._id;
    if (!buyerId) return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });

    const { productId, promoterId, shippingDetails: sd } = req.body || {};
    const quantity = req.body?.quantity === undefined ? 1 : req.body.quantity;

    if (!isId(productId)) throw fail("INVALID_PRODUCT_ID");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) throw fail("INVALID_QUANTITY");
    if (!sd || !isStr(sd.fullName, 80) || !/^\+?\d{9,15}$/.test(String(sd.phoneNumber || "")) ||
        !isStr(sd.county, 40) || !isStr(sd.subCounty, 40)) {
      throw fail("SHIPPING_DETAILS_INVALID");
    }
    const promoter = await resolvePromoter(promoterId, buyerId);

    const order = await mongoose.connection.transaction(async (session) => {
      // Atomic stock reservation: check + decrement in ONE operation (no oversell race)
      const product = await Product.findOneAndUpdate(
        { _id: productId, quantity: { $gte: quantity }, isActive: { $ne: false } },
        { $inc: { quantity: -quantity } },
        { new: true, session }
      );
      if (!product) {
        const exists = await Product.exists({ _id: productId }).session(session);
        throw exists ? fail("INSUFFICIENT_STOCK", 409) : fail("PRODUCT_NOT_FOUND", 404);
      }

      const sellerId = product.sellerId || product.merchantId;
      const delivery = product.deliveryFee || 0;
      if (!sellerId) throw fail("PRODUCT_HAS_NO_SELLER", 500);
      if (!Number.isSafeInteger(product.price) || product.price <= 0 ||
          !Number.isSafeInteger(delivery) || delivery < 0) throw fail("PRODUCT_PRICE_INVALID", 500);

      const amount = product.price * quantity + delivery;
      const orderId = new mongoose.Types.ObjectId();

      // Single source of truth for fees: the escrow service
      const hold = await holdOrderFunds(
        { orderId, buyerId, vendorId: sellerId, affiliateId: promoter, amount },
        session
      );

      const [created] = await Order.create(
        [{
          _id: orderId,
          buyerId,
          sellerId,
          promoterId: hold.affiliateBonus > 0 ? promoter : null,
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
        }],
        { session }
      );
      return created;
    });

    return res.status(201).json({
      ok: true,
      order: {
        orderNumber: order.orderNumber,
        totalAmountLocked: order.financials.totalRetailPaid,
        deliveryReleasePin: order.escrowReleasePin, // shown to the buyer only
      },
    });
  } catch (err) {
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
        { $set: { orderStatus: "DELIVERED", isEscrowReleased: true, deliveredAt: new Date(), pinAttempts: 0 } },
        { session }
      );
      if (!claimed) throw fail("ALREADY_FULFILLED", 409);
      return releaseEscrowToVendor(order._id, session); // pays vendor + promoter + platform
    });

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
    return res.json({ ok: true, status: "CANCELLED" });
  } catch (err) {
    return sendError(res, err, "cancelOrder");
  }
}

module.exports = {
  listOrders,
  createOrder,
  getDeliveryPin,
  completeDelivery,
  cancelOrder,
  // Old names kept so your existing routes keep working. All use the same safe handler.
  releaseEscrowViaQrScan: completeDelivery,
  releaseEscrowViaPinVerification: completeDelivery,
  fulfillOrderEscrowHandshake: completeDelivery,
};
