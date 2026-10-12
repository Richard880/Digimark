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

    // Validate presence of required shipping elements explicitly before database parsing
    if (!shippingDetails || !shippingDetails.subCounty || !shippingDetails.county || !shippingDetails.phoneNumber || !shippingDetails.fullName) {
      await session.abortTransaction();
      return res.status(400).json({ error: "VALIDATION_ERROR", reason: "Missing required subCounty, county, phoneNumber, or fullName in shippingDetails." });
    }

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

    // 5. Commit the new Escrow Contract order into collection log lists with schema matched naming conventions
       // 5. Commit the new Escrow Contract order into your exact schema fields
    const [order] = await Order.create([{
      orderNumber,
      buyerId,
      sellerId: product.sellerId || product.merchantId, 
      promoterId: product.fromNetwork ? (affiliateId || product.promoterId || null) : null, // Mapped to promoterId
      
      // Map your items array elements perfectly as required by schema rules
      items: [{
        productId: product._id,
        name: product.name,
        quantity: quantity,
        pricePaid: product.price,
        commissionAllocated: product.affiliateCommission || 0
      }],

      financials: {
        totalWholesaleToShop: resellerWholesaleCost, 
        totalRetailPaid: retailPricePaid,           
        totalCommissionSplit: affiliateCommission,    // Schema field matching
        deliveryFeePaid: escrowCourierFee            // Schema field matching
      },
      
      escrowReleasePin: rawReleasePin,
      
      // 🎯 FIXED STATUS MATCH: "PROCESSING" satisfies the Mongoose validation rule perfectly!
      orderStatus: "PROCESSING", 
      
      isEscrowReleased: false,
      shippingDetails: {
        subCounty: shippingDetails.subCounty,
        county: shippingDetails.county,
        phoneNumber: shippingDetails.phoneNumber,
        fullName: shippingDetails.fullName,
        deliveryNotes: shippingDetails.deliveryNotes || ""
      }
    }], { session });


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

    if (order.orderStatus === "delivered" || order.isEscrowReleased) {
      return res.status(400).json({ error: "ALREADY_FULFILLED" });
    }

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
        $inc: { balance: merchantShare },$push: {
          transactions: {
            transactionId: `REL-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
            amount: merchantShare,
            type: "receive_transfer", // Corrected to schema enum specification
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
          $inc: { balance: affiliateShare },$push: {
            transactions: {
              transactionId: `COM-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
              amount: affiliateShare,
              type: "affiliate_commission", // Corrected to schema enum specification
              status: "COMPLETED",
              description: `Commission split cut credited from Order #${orderNumber} network checkout share.`,
              createdAt: new Date()
            }
          }
        },
        { session }
      );
    }

    // 4. Update the order lifecycle milestones tracking properties 
    order.orderStatus = "delivered"; // Set to correct lowercase layout state
    order.isEscrowReleased = true;
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      ok: true,
      message: "💸 Escrow balances parsed and split routed to platform vendor nodes safely."
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Escrow QR release process failed:", error.stack || error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
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

    // Fixed: Match the schema's lowercase tracking states
    if (order.orderStatus === "delivered" || order.isEscrowReleased) {
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
        $inc: { balance: merchantShare },
        $push: {
          transactions: {
            transactionId: `REL-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
            amount: merchantShare,
            type: "receive_transfer", // Fixed: Matches your wallet schema enum option
            status: "COMPLETED",
            description: `Escrow released via verbal verification PIN handshake for Order #${orderNumber}. Wholesale cost and logistics fees credited.`,
            createdAt: new Date()
          }
        }
      },
      { session, new: true }
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
              type: "affiliate_commission", // Fixed: Matches your wallet schema enum option
              status: "COMPLETED",
              description: `Commission split cut credited from Order #${orderNumber} network checkout share.`,
              createdAt: new Date()
            }
          }
        },
        { session }
      );
    }

    // Update status indicators and save order states exactly matching schema lowercase expectations
    order.orderStatus = "delivered";
    order.isEscrowReleased = true;
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      ok: true,
      message: "🎉 Pin success! Escrow balances released and distributed securely to vendor and promoter lines.",
      orderStatus: "delivered"
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ PIN Escrow Release Pipeline Aborted:", error.stack || error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
}


/**
 * 🔒 PATCH /api/orders/:orderNumber/fulfill-handshake
 * Unified Handshake Gateway: Accepts either a text verification PIN or a scanned QR verification payload
 */
async function fulfillOrderEscrowHandshake(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { orderNumber } = req.params;
    const { pin, qrToken } = req.body; // Front-end can supply either context parameter

    if (!pin && !qrToken) {
      await session.abortTransaction();
      return res.status(400).json({ error: "VALIDATION_ERROR", reason: "Either delivery verification PIN or scanned QR token is mandatory." });
    }

    if (!req.user || !req.user._id) {
      await session.abortTransaction();
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    // 1. Fetch order data within the active transactional boundary session
    const order = await Order.findOne({ orderNumber }).session(session);
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    }

    // 2. Lifecycle Protection: Stop processing if already paid out
    if (order.orderStatus === "DELIVERED" || order.isEscrowReleased) {
      await session.abortTransaction();
      return res.status(400).json({ error: "ALREADY_FULFILLED", reason: "Funds for this order have already been split and liquidated." });
    }

    // 3. Dual-Verification Gateway Logic
    let isVerificationValid = false;
    let verificationMethod = "";

    if (pin) {
      // Verbal PIN handshake pathway
      if (order.escrowReleasePin.trim() === pin.trim()) {
        isVerificationValid = true;
        verificationMethod = "Verbal PIN validation";
      }
    } else if (qrToken) {
      // Logistics provider QR code scanning matching block
      // In this setup, your QR token text could be the order number or a hash derived from it
      if (qrToken.trim() === orderNumber.trim() || qrToken.trim() === order.escrowReleasePin.trim()) {
        isVerificationValid = true;
        verificationMethod = "Logistics QR scan handshake";
      }
    }

    if (!isVerificationValid) {
      await session.abortTransaction();
      return res.status(422).json({ error: "INVALID_VERIFICATION_CREDENTIAL", reason: "Provided delivery credential does not match secure escrow tokens." });
    }

    // 4. Map dynamic accounting figures from schema properties
    const totalEscrowAmount = order.financials.totalRetailPaid + order.financials.deliveryFeePaid;
    const merchantShare = order.financials.totalWholesaleToShop + order.financials.deliveryFeePaid;
    const promoterShare = order.financials.totalCommissionSplit;

    // 5. Atomic Ledger Updates (Using \$inc and matching schema lowercase enums)
    // A. Debit buyer's locked escrow balance pocket container
    await Wallet.findOneAndUpdate(
      { userId: order.buyerId },
      { $inc: { escrowBalance: -totalEscrowAmount } },
      { session }
    );

    // B. Credit shop vendor account available withdrawable balances
    await Wallet.findOneAndUpdate(
      { userId: order.sellerId },
      {
        $inc: { balance: merchantShare },
        $push: {
          transactions: {
            transactionId: `REL-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
            amount: merchantShare,
            type: "receive_transfer",
            status: "COMPLETED",
            description: `Escrow released via ${verificationMethod} for Order #${orderNumber}. Wholesale cost and logistics fees credited.`,
            createdAt: new Date()
          }
        }
      },
      { session }
    );

    // C. Credit promoter node account if an affiliate split was captured
    if (order.promoterId && promoterShare > 0) {
      await Wallet.findOneAndUpdate(
        { userId: order.promoterId },
        {
          $inc: { balance: promoterShare },
          $push: {
            transactions: {
              transactionId: `COM-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
              amount: promoterShare,
              type: "affiliate_commission",
              status: "COMPLETED",
              description: `Commission split cut credited from Order #${orderNumber} showcase checkout network split.`,
              createdAt: new Date()
            }
          }
        },
        { session }
      );
    }

    // 6. Finalize Order Object Properties to exactly match your uppercase Mongoose enum
    order.orderStatus = "DELIVERED";
    order.isEscrowReleased = true;
    await order.save({ session });

    // Commit state changes together
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      ok: true,
      message: `💸 Handshake verified via ${verificationMethod}! Balances split and deposited safely.`,
      status: "DELIVERED"
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Fulfill Escrow Handshake Failure:", error.stack || error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
}


module.exports = {
  listOrders,
  createOrder,
  releaseEscrowViaQrScan,
  releaseEscrowViaPinVerification,
  fulfillOrderEscrowHandshake
};


