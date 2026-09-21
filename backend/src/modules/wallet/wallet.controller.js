const Wallet = require("../../models/Wallet");

/**
 * 🔒 GET /api/wallet/my-balance
 * Safely fetches a user's active balance metrics and accounting journal receipt lists
 */
async function getMyWalletDetails(req, res) {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    // Locate the user's wallet or dynamically initialize a fresh zeroed balance sheet container if it's their first time viewing
    let wallet = await Wallet.findOne({ userId: req.user._id }).lean();

    if (!wallet) {
      wallet = await Wallet.create({
        userId: req.user._id,
        balance: 0,
        escrowBalance: 0,
        transactions: []
      });
    }

    // Sort transactions array locally so the newest transaction history receipts display at the very top of their list
    const sortedTransactions = (wallet.transactions || []).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return res.status(200).json({
      ok: true,
      balance: wallet.balance,
      escrowBalance: wallet.escrowBalance,
      isFrozen: wallet.isFrozen,
      transactions: sortedTransactions
    });

  } catch (error) {
    console.error("❌ Error inside getMyWalletDetails loop:", error.stack || error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
}

module.exports = { getMyWalletDetails };
