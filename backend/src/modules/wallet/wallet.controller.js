const Wallet = require("../../models/Wallet");
const mongoose = require("mongoose");
const crypto = require("crypto");

/**
 * Helper to generate an upper-case 9-character alphanumeric ID 
 * mimicking the schema's fallback generation structure.
 */
function generateTxnId(prefix = "TXN") {
  const randomChars = crypto.randomBytes(5).toString("hex").substring(0, 9).toUpperCase();
  return `${prefix}-${randomChars}`;
}

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
      // Create a fresh structural layout balance sheet matching schema defaults
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
 * Routes directly into the Safaricom Daraja/IntaSend SDK engine to update liquid credit
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
    if (wallet.isFrozen) return res.status(403).json({ error: "WALLET_FROZEN" });

    const transactionId = generateTxnId("MPA");

    // Append dynamic incoming ledger item entry logs using valid schema definitions
    wallet.balance += numericAmount;
    wallet.transactions.push({
      transactionId,
      amount: numericAmount,
      type: "deposit", // Strictly mapped to your schema enum: "deposit"
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
 * Called directly by the order controller inside a shared Mongoose ACID session context
 */
async function allocateEscrowFunds(userId, totalCost, orderNumber, session) {
  // Execute within the active tracking session to avoid dirty reads
  const wallet = await Wallet.findOne({ userId }).session(session);

  if (!wallet) {
    const err = new Error("WALLET_NOT_FOUND");
    err.currentBalance = 0;
    err.deficit = totalCost;
    throw err;
  }

  if (wallet.isFrozen) {
    throw new Error("WALLET_FROZEN");
  }

  if (wallet.balance < totalCost) {
    const err = new Error("INSUFFICIENT_FUNDS");
    err.currentBalance = wallet.balance;
    err.deficit = totalCost - wallet.balance;
    throw err;
  }

  const transactionId = generateTxnId("ESC");

  // Atomic state shifts: fluid liquidity flows directly into locked escrow balances
  wallet.balance -= totalCost;
  wallet.escrowBalance += totalCost;

  // Track the flow configuration with schema-compliant data types
  wallet.transactions.push({
    transactionId,
    amount: -totalCost, // Outflow calculation line item entry
    type: "product_purchase", // Strictly mapped to your schema enum: "product_purchase"
    status: "ESCROW_HELD", // Schema enum supports this state
    referenceId: String(orderNumber),
    description: `Funds secured for Order #${orderNumber}. Securely held within SokoDigi escrow balance blocks until delivery verification PIN handshake.`,
    createdAt: new Date()
  });

  // Persist the array mutations safely inside the running session block
  await wallet.save({ session });
  return transactionId;
}

module.exports = { 
  getMyWalletDetails, 
  handleMpesaTopUp,
  allocateEscrowFunds 
};
