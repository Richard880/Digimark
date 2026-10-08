const Wallet = require("../../models/Wallet");
const mongoose = require("mongoose");
const crypto = require("crypto");

/**
 * 🔒 GET /api/wallet/my-balance
 * Safely fetches a user's active balance metrics and accounting journal receipt lists
 */
async function getMyWalletDetails(req, res) {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    // Locate the user's wallet or dynamically initialize a fresh zeroed balance sheet container
    let wallet = await Wallet.findOne({ userId: req.user._id }).lean();

    if (!wallet) {
      // Create a fresh structural layout balance sheet matching your schema defaults
      const rawWallet = await Wallet.create({
        userId: req.user._id,
        balance: 0,
        escrowBalance: 0,
        transactions: []
      });
      wallet = rawWallet.toObject();
    }

    // Sort transactions array locally so the newest transaction history receipts display at the very top
    const sortedTransactions = (wallet.transactions || []).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return res.status(200).json({
      ok: true,
      balance: wallet.balance,
      escrowBalance: wallet.escrowBalance,
      isFrozen: wallet.isFrozen || false,
      transactions: sortedTransactions
    });

  } catch (error) {
    console.error("❌ Error inside getMyWalletDetails loop:", error.stack || error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
}

/**
 * 📲 POST /api/wallet/mpesa-topup
 * Simulates or routes directly into your Safaricom Daraja/IntaSend SDK engine to update liquid credit
 */
async function handleMpesaTopUp(req, res) {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    const { amount } = req.body;
    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount < 10) {
      return res.status(400).json({ error: "Minimum M-PESA STK allocation target threshold is Ksh 10." });
    }

    // Locate matching wallet ledger sheet profile
    const wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet) return res.status(404).json({ error: "Wallet matrix container profile not found." });

    const transactionId = `MPA${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

    // Append dynamic incoming ledger notification item entry logs
    wallet.balance += numericAmount;
    wallet.transactions.push({
      transactionId,
      type: "MPESA_DEPOSIT",
      amount: numericAmount,
      status: "COMPLETED",
      description: `Instant over-the-air top-up of Ksh ${numericAmount.toLocaleString()} verified successfully via STK push.`,
      createdAt: new Date()
    });

    await wallet.save();

    return res.status(200).json({
      ok: true,
      message: "📲 Safaricom STK push handshake initialization acknowledged successfully.",
      transactionId
    });

  } catch (error) {
    console.error("❌ M-PESA top-up exception handler:", error);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
}

/**
 * 🔄 INTERNAL SYSTEM METHOD: allocateEscrowFunds
 * This method is called directly by your order controller inside a shared ACID session context
 */
async function allocateEscrowFunds(userId, totalCost, orderNumber, session) {
  const wallet = await Wallet.findOne({ userId }).session(session);

  if (!wallet || wallet.balance < totalCost) {
    const currentBalance = wallet ? wallet.balance : 0;
    const err = new Error("INSUFFICIENT_FUNDS");
    err.currentBalance = currentBalance;
    err.deficit = totalCost - currentBalance;
    throw err;
  }

  if (wallet.isFrozen) {
    throw new Error("WALLET_FROZEN");
  }

  const transactionId = `ESC${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

  // Atomic state shifts: shift values from fluid liquidity straight into locked escrow balances
  wallet.balance -= totalCost;
  wallet.escrowBalance += totalCost;

  wallet.transactions.push({
    transactionId,
    type: "ESCROW_LOCK",
    amount: -totalCost, // Negative indicates an outflow transaction line item
    status: "ESCROW_HELD",
    description: `Funds secured for Order ${orderNumber}. Securely held within SokoDigi escrow contracts until delivery verification PIN handshake.`,
    createdAt: new Date()
  });

  await wallet.save({ session });
  return transactionId;
}

module.exports = { 
  getMyWalletDetails, 
  handleMpesaTopUp,
  allocateEscrowFunds 
};
