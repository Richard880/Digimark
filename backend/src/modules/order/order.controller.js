const mongoose = require("mongoose");
const Order = require("../../models/Order");
const Wallet = require("../../models/Wallet");

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

    const wholesaleAmount = order.financials.totalWholesaleToShop;

    const updatedSellerWallet = await Wallet.findOneAndUpdate(
      { userId: order.sellerId, escrowBalance: { $gte: wholesaleAmount } },
      {
        (inc: { escrowBalance: -wholesaleAmount, balance: wholesaleAmount },)push: {
          transactions: {
            amount: wholesaleAmount,
            type: "receive_payments",
            status: "COMPLETED",
            referenceId: orderNumber,
            description: `Escrow released via consumer QR handshake for Order #${orderNumber}`
          }
        }
      },
      { session, new: true }
    );

    if (!updatedSellerWallet) {
      throw new Error("ESCROW_RELEASE_FAILED: Unable to verify held ledger balances.");
    }

    order.orderStatus = "DELIVERED";
    order.isEscrowReleased = true;
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      ok: true,
      message: `🎉 Handshake success! Ksh ${wholesaleAmount.toLocaleString()} released securely to your available balance.`,
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

    if (order.orderStatus === "DELIVERED" || order.isEscrowReleased) {
      return res.status(400).json({ error: "ALREADY_FULFILLED" });
    }

    if (order.escrowReleasePin.trim() !== providedPin.trim()) {
      return res.status(422).json({ error: "INVALID_RELEASE_PIN" });
    }

    const wholesaleAmount = order.financials.totalWholesaleToShop;

    const updatedWallet = await Wallet.findOneAndUpdate(
      { userId: order.sellerId, escrowBalance: { $gte: wholesaleAmount } },
      {
        (inc: { escrowBalance: -wholesaleAmount, balance: wholesaleAmount },)push: {
          transactions: {
            amount: wholesaleAmount,
            type: "receive_payments",
            status: "COMPLETED",
            referenceId: orderNumber,
            description: `Escrow released via verbal PIN verification for Order #${orderNumber}`
          }
        }
      },
      { session, new: true }
    );

    if (!updatedWallet) {
      throw new Error("LEDGER_UPGRADE_FAULT");
    }

    order.orderStatus = "DELIVERED";
    order.isEscrowReleased = true;
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      ok: true,
      message: `🎉 Pin success! Ksh ${wholesaleAmount.toLocaleString()} credited to available balance.`,
      orderStatus: "DELIVERED"
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ PIN Escrow Release Pipeline Aborted:", error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

module.exports = { 
  listOrders, 
  releaseEscrowViaQrScan, 
  releaseEscrowViaPinVerification 
};
