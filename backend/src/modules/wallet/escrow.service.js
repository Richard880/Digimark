const mongoose = require("mongoose");
const Wallet = require("../../models/Wallet");
const EscrowAccount = require("../../models/EscrowAccount");

// Fee rules live on the server only. Never accept rates from a caller.
const PLATFORM_BP = 100;   // 1%
const AFFILIATE_BP = 500;  // 5%

const PLATFORM_USER_ID = process.env.PLATFORM_WALLET_USER_ID;
if (!PLATFORM_USER_ID) throw new Error("Missing env PLATFORM_WALLET_USER_ID");

class EscrowError extends Error {
  constructor(code, status = 400, extra = {}) {
    super(code);
    this.code = code;
    this.status = status;
    Object.assign(this, extra);
  }
}

// Use the caller's session if given (so it joins the order's transaction), else open one.
const runInTxn = (fn, outerSession) =>
  outerSession ? fn(outerSession) : mongoose.connection.transaction(fn);

const same = (a, b) => String(a) === String(b);

// Credits a wallet that must already exist (wallets are created at signup, never upserted here).
// Credits even if the wallet is frozen: the money is theirs; freezing should block spending/withdrawing.
async function creditWallet(userId, amount, orderId, description, session) {
  if (amount <= 0) return;
  const w = await Wallet.findOneAndUpdate(
    { userId },
    {
      $inc: { balance: amount },
      $push: {
        transactions: {
          amount,
          type: "receive_transfer",
          status: "COMPLETED",
          referenceId: String(orderId),
          description,
        },
      },
    },
    { new: true, session }
  );
  if (!w) throw new EscrowError("PAYEE_WALLET_MISSING", 500, { userId: String(userId) });
}

/**
 * Buyer's wallet balance -> buyer's escrowBalance, plus the EscrowAccount record.
 * Call from the order controller INSIDE its transaction: holdOrderFunds({...}, session)
 * amount, in integer cents. Price must come from the database, not from the client.
 */
async function holdOrderFunds(
  { orderId, buyerId, vendorId, affiliateId = null, amount, feeBase = amount },
  outerSession
) {
  if (!outerSession) throw new EscrowError("SESSION_REQUIRED", 500); // order creation must join its own transaction
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new EscrowError("INVALID_AMOUNT");
  if (!Number.isSafeInteger(feeBase) || feeBase <= 0 || feeBase > amount) throw new EscrowError("INVALID_AMOUNT");
  if (same(buyerId, vendorId)) throw new EscrowError("SELF_PURCHASE_NOT_ALLOWED");
  if (affiliateId && (same(affiliateId, buyerId) || same(affiliateId, vendorId))) affiliateId = null;

  // Fees come off the product price only. Delivery is paid to the seller in full.
  const platformFee = Math.round((feeBase * PLATFORM_BP) / 10000);
  const affiliateBonus = affiliateId ? Math.round((feeBase * AFFILIATE_BP) / 10000) : 0;
  const vendorNet = amount - platformFee - affiliateBonus;
  if (vendorNet <= 0) throw new EscrowError("AMOUNT_TOO_SMALL");

  return runInTxn(async (session) => {
    // One atomic step: check frozen + check balance + move funds. No read-then-write race.
    const buyerWallet = await Wallet.findOneAndUpdate(
      { userId: buyerId, isFrozen: { $ne: true }, balance: { $gte: amount } },
      {
        $inc: { balance: -amount, escrowBalance: amount },
        $push: {
          transactions: {
            amount: -amount,
            type: "product_purchase",
            status: "ESCROW_HELD",
            referenceId: String(orderId),
            description: `Funds secured in escrow for Order #${orderId}. Released when delivery PIN is verified.`,
          },
        },
      },
      { new: true, session }
    );

    if (!buyerWallet) {
      const w = await Wallet.findOne({ userId: buyerId }).session(session);
      if (!w) throw new EscrowError("WALLET_NOT_FOUND", 404);
      if (w.isFrozen) throw new EscrowError("WALLET_FROZEN", 403);
      throw new EscrowError("INSUFFICIENT_FUNDS", 402, {
        currentBalance: w.balance,
        deficit: amount - w.balance,
      });
    }

    try {
      const [escrow] = await EscrowAccount.create(
        [{
          orderId, buyerId, vendorId, affiliateId,
          totalAmountHeld: amount,
          vendorSplitAmount: vendorNet,
          affiliateBonusAmount: affiliateBonus,
          platformCommissionAmount: platformFee,
          status: "SECURED",
        }],
        { session }
      );
      return { escrowId: escrow._id, vendorNet, affiliateBonus, platformFee, affiliateId };
    } catch (e) {
      if (e.code === 11000) throw new EscrowError("ESCROW_ALREADY_EXISTS", 409);
      throw e;
    }
  }, outerSession);
}
/**
 * Pays vendor + affiliate + platform out of escrow.
 * ONLY call after the controller has verified: (1) req.user is the vendor of this order,
 * (2) the 6-digit PIN / QR matches (with attempt limits).
 */
async function releaseEscrowToVendor(orderId, outerSession) {
  return runInTxn(async (session) => {
    // The status flip IS the lock: only one caller can ever win SECURED -> DISBURSED.
    const escrow = await EscrowAccount.findOneAndUpdate(
      { orderId, status: "SECURED" },
      { status: "DISBURSED", disbursedAt: new Date() },
      { new: true, session }
    );
    if (!escrow) throw new EscrowError("ESCROW_NOT_RELEASABLE", 409);

    // Safety invariant: the pieces must add up exactly to what was held.
    const sum = escrow.vendorSplitAmount + escrow.affiliateBonusAmount + escrow.platformCommissionAmount;
    if (sum !== escrow.totalAmountHeld) throw new EscrowError("ESCROW_SPLIT_MISMATCH", 500);

    const buyer = await Wallet.findOneAndUpdate(
      { userId: escrow.buyerId, escrowBalance: { $gte: escrow.totalAmountHeld } },
      { $inc: { escrowBalance: -escrow.totalAmountHeld } },
      { session }
    );
    if (!buyer) throw new EscrowError("ESCROW_BALANCE_INVARIANT_VIOLATED", 500);

    await creditWallet(escrow.vendorId, escrow.vendorSplitAmount, orderId,
      `Escrow released for Order #${orderId}. Net sale earnings.`, session);
    if (escrow.affiliateId)
      await creditWallet(escrow.affiliateId, escrow.affiliateBonusAmount, orderId,
        `Affiliate bonus for Order #${orderId}.`, session);
    await creditWallet(PLATFORM_USER_ID, escrow.platformCommissionAmount, orderId,
      `Platform fee for Order #${orderId}.`, session);

    return { releasedToVendor: escrow.vendorSplitAmount };
  }, outerSession);
}

/**
 * Full refund to the buyer (seller declines, order expires, or admin dispute outcome).
 * The caller must authorize who may trigger it.
 */
async function refundEscrowToBuyer(orderId, outerSession) {
  return runInTxn(async (session) => {
    const escrow = await EscrowAccount.findOneAndUpdate(
      { orderId, status: "SECURED" },
      { status: "REFUNDED", refundedAt: new Date() },
      { new: true, session }
    );
    if (!escrow) throw new EscrowError("ESCROW_NOT_REFUNDABLE", 409);

    const w = await Wallet.findOneAndUpdate(
      { userId: escrow.buyerId, escrowBalance: { $gte: escrow.totalAmountHeld } },
      {
        $inc: { escrowBalance: -escrow.totalAmountHeld, balance: escrow.totalAmountHeld },
        $push: {
          transactions: {
            amount: escrow.totalAmountHeld,
            type: "receive_transfer",
            status: "COMPLETED",
            referenceId: String(orderId),
            description: `Refund for Order #${orderId}. Escrow returned to your wallet.`,
          },
        },
      },
      { session }
    );
    if (!w) throw new EscrowError("ESCROW_BALANCE_INVARIANT_VIOLATED", 500);
    return { refunded: escrow.totalAmountHeld };
  }, outerSession);
}

module.exports = { holdOrderFunds, releaseEscrowToVendor, refundEscrowToBuyer, EscrowError };
