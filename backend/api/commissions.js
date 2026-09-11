// api/commissions.js
const express = require("express");
const { applyCommissions } = require("../utils/commissions");
const wallets = require("../data/wallets");

const router = express.Router();

// record a sale and auto-apply commissions
// body: { userId, amount, saleId (optional) }
router.post("/record", (req, res) => {
  const { userId, amount, saleId } = req.body;
  if (!userId || !amount)
    return res.status(400).json({ error: "userId and amount required" });

  // apply commissions up the chain
  const results = applyCommissions(userId, Number(amount), { saleId });

  // return balances of recipients
  const recipients = results.map((r) => ({
    userId: r.userId,
    level: r.level,
    commission: r.commission,
    balance: wallets.getWallet(r.userId)?.balance || 0,
  }));

  return res.json({ ok: true, recipients });
});

module.exports = router;
