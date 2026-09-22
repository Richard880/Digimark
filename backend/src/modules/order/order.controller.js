/**
 * 🔒 PATCH /api/orders/verify-release-pin
 * Handshake PIN Gateway: Allows a merchant/rider to input the buyer's verbal pin to unlock escrow balances
 */
async function releaseEscrowViaPinVerification(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { orderNumber, providedPin } = req.body;

    if (!orderNumber || !providedPin) {
      return res.status(400).json({ error: "ORDER_NUMBER_AND_PIN_MANDATORY" });
    }

    // 1. Verify caller session token authentication parameters
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    // 2. Locate the order
    const order = await Order.findOne({ orderNumber }).session(session);
    if (!order) {
      return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    }

    // 🛡️ SECURITY GUARD: Only the destination seller/shop owner (or their courier) can input this code to get paid
    if (order.sellerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "ACCESS_DENIED", reason: "Only the destination vendor account can input verification PIN codes to fetch balances." });
    }

    if (order.orderStatus === "DELIVERED" || order.isEscrowReleased) {
      return res.status(400).json({ error: "ALREADY_FULFILLED", reason: "This transaction has already been concluded." });
    }

    // 🎯 CRITICAL RULE: Validate the provided token against your master database string property
    if (order.escrowReleasePin.trim() !== providedPin.trim()) {
      return res.status(422).json({ 
        error: "INVALID_RELEASE_PIN", 
        reason: "The verification code entered does not match the buyer's unique secure signature." 
      });
    }

    const wholesaleAmount = order.financials.totalWholesaleToShop;

    // 3. Shift the wholesale money balance out of escrow safely using an atomic credit operator
    const updatedWallet = await Wallet.findOneAndUpdate(
      { userId: order.sellerId, escrowBalance: { \$gte: wholesaleAmount } },
      {
        inc: escrowBalance: -wholesaleAmount, balance: wholesaleAmount ,push: {
          transactions: {
            amount: wholesaleAmount,
            type: "receive_payments",
            status: "COMPLETED",
            referenceId: orderNumber,
            description: `Escrow released via verbal PIN authentication code entry for Order #${orderNumber}`
          }
        }
      },
      { session, new: true }
    );

    if (!updatedWallet) {
      throw new Error("LEDGER_UPGRADE_FAULT: Unable to safely process balance shifting inside registry.");
    }

    // 4. Close order records completely
    order.orderStatus = "DELIVERED";
    order.isEscrowReleased = true;
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      ok: true,
      message: `🎉 Pin verification success! Ksh ${wholesaleAmount.toLocaleString()} has been unlocked and credited to your available shop balance rows.`,
      orderStatus: "DELIVERED"
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ PIN Escrow Release Pipeline Aborted:", error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// Don't forget to export it!
module.exports = { releaseEscrowViaQrScan, releaseEscrowViaPinVerification };
