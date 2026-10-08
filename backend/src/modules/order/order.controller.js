const mongoose = require("mongoose");
const Order = require("../../models/Order");
const Wallet = require("../../models/Wallet");
const Product = require("../../models/Product"); // Assumes your product model path matches this layout
const crypto = require("crypto");
const { allocateEscrowFunds } = require("../wallet/wallet.controller");

/**
 * 🛒 GET /api/orders
 * Retrieves all order logs relevant to the logged-in account (Acts as buyer or seller)
 */
async function listOrders(req, res) {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    const filter = {};
    
    // If they are a business account track, show items sold. Otherwise, show their purchases.
    if (req.userCategory === "network") {
      filter.sellerId = req.user._id;
    } else {
      filter.buyerId = req.user._id;
    }

    const { status } = req.query;
    if (status && status !== "all") {
      filter.orderStatus = status;
    }

    const orders = await Order.find(filter)
      .populate("buyerId", "name email phone")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(orders);
  } catch (error) {
    console.error("❌ Exception inside listOrders:", error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

/**
 * 🔒 POST /api/orders
 * 🚀 PLUGGED HOOK: Creates an order, locks wallet balances into escrow, and deducts product quantity atomically
 */
async function createOrder(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    const buyerId = req.user._id;
    const { productId, quantity = 1, shippingDetails, affiliateId } = req.body;

    // 1. Fetch product data from database within the active session
    const product = await Product.findById(productId).session(session);
    if (!product) {
      await session.abortTransaction();
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND", reason: "Product does not exist in inventory." });
    }

    if (product.quantity < quantity) {
      await session.abortTransaction();
      return res.status(400).json({ error: "INSUFFICIENT_STOCK", reason: "Not enough warehouse stock available." });
    }

    // 2. Map SokoDigi split-accounting pricing financial variables
    const retailPricePaid = product.price * quantity;
    const escrowCourierFee = product.deliveryFee || 0;
    const totalAmountToLock = retailPricePaid + escrowCourierFee;

    const affiliateCommission = (product.affiliateCommission || 0) * quantity;
    const resellerWholesaleCost = retailPricePaid - affiliateCommission;

    const orderNumber = `SDO-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const rawReleasePin = crypto.randomInt(100000, 999999).toString();

    // 3. Atomically lock wallet balance into escrow state container via the shared helper hook
    try {
      await allocateEscrowFunds(buyerId, totalAmountToLock, orderNumber, session);
    } catch (walletError) {
      await session.abortTransaction();
      
      // Clean Error Boundary Response matching your custom frontend interceptor pattern
      if (walletError.message === "INSUFFICIENT_FUNDS") {
        return res.status(402).json({
          reason: "INSUFFICIENT_FUNDS",
          error: `Insufficient wallet balance. Total required is Ksh ${totalAmountToLock.toLocaleString()}.`,
          currentBalance: walletError.currentBalance,
          deficit: walletError.deficit
        });
      }
      throw walletError;
    }

    // 4. Deduct the warehouse catalog stock
    product.quantity -= quantity;
    await product.save({ session });

    // 5. Commit the new Escrow Contract order into collection log lists
    const [order] = await Order.create([{
      orderNumber,
      buyerId,
      sellerId: product.sellerId || product.merchantId, // Fallback fields matching your model profile index keys
      affiliateId: product.fromNetwork ? (affiliateId || product.affiliateId) : null,
      productId,
      quantity,
      financials: {
        retailPricePaid,
        affiliateCommission,
        resellerWholesaleCost,
        escrowCourierFee,
        totalAmountLocked: totalAmountToLock
      },
      escrowReleasePin: rawReleasePin,
      orderStatus: "PENDING",
      isEscrowReleased: false,
      shippingDetails
    }], { session });

    // Finalize data batch execution pipeline updates safely
    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      ok: true,
      message: "🎉 Escrow transaction initialised and funds locked successfully!",
      order: {
        orderNumber: order.orderNumber,
        totalAmountLocked: order.financials.totalAmountLocked,
        deliveryReleasePin: rawReleasePin
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Order Creation Pipeline Aborted:", error.stack || error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
}

/**
 * 🔒 PATCH /api/orders/:orderNumber/release-escrow
 * Handshake Scan Gateway: Moves held wholesale cuts out of escrow and into available shop balances
 */
async function releaseEscrowViaQrScan(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { orderNumber } = req.params;

    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    const order = await Order.findOne({ orderNumber }).session(session);
    if (!order) {
      return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    }

    if (order.buyerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        error: "ACCESS_DENIED", 
        reason: "Fulfillment Violation: Only the verified buyer can authorize escrow cash releases." 
      });
    }

    if (order.orderStatus === "DELIVERED" || order.isEscrowReleased) {
      return res.status(400).json({ error: "ALREADY_FULFILLED" });
    }

    // 💡 REPAIRED ACCOUNTING INCENTIVE BREAKDOWN PIPELINES
    const totalEscrowAmount = order.financials.totalAmountLocked;
    const merchantShare = order.financials.resellerWholesaleCost + order.financials.escrowCourierFee;
    const affiliateShare = order.financials.affiliateCommission;

    // 1. Debit and clear funds from the buyer's locked escrow pocket balance layout container
    await Wallet.findOneAndUpdate(
      { userId: order.buyerId },
      { $inc: { escrowBalance: -totalEscrowAmount } },
      { session }
    );

    // 2. Allocate the wholesale amount and delivery fees straight to the merchant's fluid wallet balance
    await Wallet.findOneAndUpdate(
      { userId: order.sellerId },
      {
        $inc: { balance: merchantShare },
        $push: {
          transactions: {
            transactionId: `REL-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
            amount: merchantShare,
            type: "RECEIVE_PAYMENT",
            status: "COMPLETED",
            description: `Escrow released via customer QR code handshake for Order #${orderNumber}. Wholesale cost and logistics fees credited.`,
            createdAt: new Date()
          }
        }
      },
      { session }
    );

    // 3. Allocate profit cut margins to the network promoter marketer wallet if an affiliate tracking ID is logged
    if (order.affiliateId && affiliateShare > 0) {
      await Wallet.findOneAndUpdate(
        { userId: order.affiliateId },
        {
          $inc: { balance: affiliateShare },
          $push: {
            transactions: {
              transactionId: `COM-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
              amount: affiliateShare,
              type: "AFFILIATE_COMMISSION",
              status: "COMPLETED",
              description: `Commission split cut credited from Order #${orderNumber} network checkout share.`,
              createdAt: new Date()
            }
          }
        },
        { session }
      );
    }

    order.orderStatus = "DELIVERED";
    order.isEscrowReleased = true;
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      ok: true,
      message: `🎉 Handshake success! Escrow balances released and distributed securely to vendor and promoter lines.`,
      orderStatus: "DELIVERED"
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ QR Escrow Release Pipeline Aborted:", error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

/**
 * 🔒 PATCH /api/orders/verify-release-pin
 * Handshake PIN Fallback: Allows a vendor/courier to enter the buyer's verbal pin to unlock escrow balances
 */
async function releaseEscrowViaPinVerification(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { orderNumber, providedPin } = req.body;

    if (!orderNumber || !providedPin) {
      return res.status(400).json({ error: "ORDER_NUMBER_AND_PIN_MANDATORY" });
    }

    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    const order = await Order.findOne({ orderNumber }).session(session);
    if (!order) {
      return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    }

    if (order.sellerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "ACCESS_DENIED", reason: "Only the destination vendor account can input verification PIN codes." });
    }

       // Ensure data validation boundaries pass cleanly before evaluation
    if (order.orderStatus === "DELIVERED" || order.isEscrowReleased) {
      return res.status(400).json({ error: "ALREADY_FULFILLED" });
    }

    if (order.escrowReleasePin.trim() !== providedPin.trim()) {
      return res.status(422).json({ error: "INVALID_RELEASE_PIN" });
    }

    // 💡 REPAIRED ACCOUNTING INCENTIVE BREAKDOWN PIPELINES
    const totalEscrowAmount = order.financials.totalAmountLocked;
    const merchantShare = order.financials.resellerWholesaleCost + order.financials.escrowCourierFee;
    const affiliateShare = order.financials.affiliateCommission;

    // 1. Debit and clear funds from the buyer's locked escrow pocket balance layout container
    await Wallet.findOneAndUpdate(
      { userId: order.buyerId },
      { $inc: { escrowBalance: -totalEscrowAmount } },
      { session }
    );

    // 2. Allocate the wholesale amount and delivery fees straight to the merchant's fluid wallet balance
    await Wallet.findOneAndUpdate(
      { userId: order.sellerId },
      {
        (inc: { balance: merchantShare },)push: {
          transactions: {
            transactionId: `REL-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
            amount: merchantShare,
            type: "RECEIVE_PAYMENT",
            status: "COMPLETED",
            description: `Escrow released via verbal verification PIN handshake for Order #${orderNumber}. Wholesale cost and logistics fees credited.`,
            createdAt: new Date()
          }
        }
      },
      { session }
    );

    // 3. Allocate profit cut margins to the network promoter marketer wallet if an affiliate tracking ID is logged
    if (order.affiliateId && affiliateShare > 0) {
      await Wallet.findOneAndUpdate(
        { userId: order.affiliateId },
        {
          (inc: { balance: affiliateShare },)push: {
            transactions: {
              transactionId: `COM-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
              amount: affiliateShare,
              type: "AFFILIATE_COMMISSION",
              status: "COMPLETED",
              description: `Commission split cut credited from Order #${orderNumber} network checkout share.`,
              createdAt: new Date()
            }
          }
        },
        { session }
      );
    }

    // Update status indicators and save order states
    order.orderStatus = "DELIVERED";
    order.isEscrowReleased = true;
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      ok: true,
      message: "🎉 Pin success! Escrow balances released and distributed securely to vendor and promoter lines.",
      orderStatus: "DELIVERED"
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ PIN Escrow Release Pipeline Aborted:", error.stack || error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
}

module.exports = {
  listOrders,
  createOrder,
  releaseEscrowViaQrScan,
  releaseEscrowViaPinVerification
};


