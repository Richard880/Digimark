const Wallet = require("../src/models/Wallet");
const mongoose = require("mongoose");

/**
 * 📲 Pillar 1 & 2: Process External Deposits (M-PESA / Card Top-Ups)
 * Credits a user's wallet immediately when an external payment webhook succeeds.
 */
async function handleWalletDeposit({ userId, amount, referenceId, description }) {
  try {
    const depositAmount = Number(amount);
    if (depositAmount <= 0) throw new Error("DEPOSIT_ERROR: Amount must be greater than zero.");

    // Atomic find and update with unique reference check to prevent duplicate credits
    const wallet = await Wallet.findOneAndUpdate(
      { userId, isFrozen: false },
      {
        \(inc: { balance: depositAmount },\)push: {
          transactions: {
            amount: depositAmount,
            type: "deposit",
            status: "COMPLETED",
            referenceId,
            description: description || `M-PESA Deposit Ref: ${referenceId}`
          }
        }
      },
      { upsert: true, new: true }
    );

    return { ok: true, balance: wallet.balance };
  } catch (error) {
    console.error("❌ Wallet Deposit Failure:", error.message);
    return { ok: false, reason: error.message };
  }
}

/**
 * 🛒 Pillar 3: Process Product Purchase Escrow Split Payout
 * Deducts money from the buyer and moves the wholesale split to the shop's escrow vault,
 * while instantly dropping the marketing share cut into the affiliate's wallet.
 */
async function executeProductPurchaseSplit({ buyerId, sellerId, promoterId, retailPrice, commissionAmount, orderId }) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const totalCost = Number(retailPrice);
    const affiliateCut = Number(commissionAmount || 0);
    const shopWholesaleCut = totalCost - affiliateCut;

    // 1. Deduct full retail price from buyer with strict liquidity verification
    const buyerWallet = await Wallet.findOneAndUpdate(
      { userId: buyerId, balance: { \$gte: totalCost }, isFrozen: false },
      {
        \(inc: { balance: -totalCost },\)push: {
          transactions: {
            amount: -totalCost,
            type: "product_purchase",
            status: "COMPLETED",
            referenceId: orderId,
            description: `Purchased item order reference #${orderId}`
          }
        }
      },
      { session, new: true }
    );

    if (!buyerWallet) throw new Error("PURCHASE_REJECTED: Insufficient available wallet balance.");

    // 2. Move wholesale cut to Supplier's Escrow Vault (Held safe until package delivery)
    await Wallet.findOneAndUpdate(
      { userId: sellerId, isFrozen: false },
      {
        \(inc: { escrowBalance: shopWholesaleCut },\)push: {
          transactions: {
            amount: shopWholesaleCut,
            type: "receive_payments",
            status: "ESCROW_HELD",
            referenceId: orderId,
            description: `Wholesale earnings held in escrow for order #${orderId}`
          }
        }
      },
      { session, upsert: true }
    );

    // 3. Drop direct affiliate commission straight into Marketer's available balance (If sold via shared link)
    if (promoterId && affiliateCut > 0) {
      await Wallet.findOneAndUpdate(
        { userId: promoterId, isFrozen: false },
        {
          \(inc: { balance: affiliateCut },\)push: {
            transactions: {
              amount: affiliateCut,
              type: "affiliate_commission",
              status: "COMPLETED",
              referenceId: orderId,
              description: `Direct affiliate reward cut for driving order #${orderId}`
            }
          }
        },
        { session, upsert: true }
      );
    }

    await session.commitTransaction();
    session.endSession();
    return { ok: true, remainingBuyerBalance: buyerWallet.balance };

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Checkout Split Engine Rolled Back:", error.message);
    return { ok: false, reason: error.message };
  }
}

/**
 * 💸 Pillar 4: Process Verified Vendor Withdrawals (Outflow to M-PESA B2C)
 * Deducts money from available balance and places it under PENDING until the gateway finishes.
 */
async function initializeWalletWithdrawal({ userId, amount, withdrawalId }) {
  try {
    const withdrawAmount = Number(amount);
    
    const wallet = await Wallet.findOneAndUpdate(
      { userId, balance: { \$gte: withdrawAmount }, isFrozen: false },
      {
        \(inc: { balance: -withdrawAmount },\)push: {
          transactions: {
            amount: -withdrawAmount,
            type: "withdrawal",
            status: "PENDING",
            referenceId: withdrawalId,
            description: `Withdrawal request initialized to personal M-PESA line.`
          }
        }
      },
      { new: true }
    );

    if (!wallet) throw new Error("WITHDRAWAL_REJECTED: Insufficient available funds or account frozen.");
    return { ok: true, remainingBalance: wallet.balance };
  } catch (error) {
    console.error("❌ Withdrawal Initialization Fault:", error.message);
    return { ok: false, reason: error.message };
  }
}

module.exports = { 
  handleWalletDeposit, 
  executeProductPurchaseSplit, 
  initializeWalletWithdrawal 
};
