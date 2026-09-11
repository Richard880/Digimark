// utils/mlm.js
const wallets = require("../data/wallets");

/*
  distributeCommissions(userId, amount, referralMap, commissionRates)
  - userId: buyer who triggered commission
  - amount: purchase amount (number)
  - referralMap: function or object that returns immediate referrer for a given userId
  - commissionRates: array of 4 numbers (e.g. [0.10, 0.05, 0.03, 0.01])
*/
async function distributeCommissions(
  userId,
  amount,
  referralMap,
  commissionRates = [0.1, 0.05, 0.03, 0.01]
) {
  // referralMap can be a function (userId => refId) or an object {userId: refId}
  let current = userId;
  for (let level = 0; level < Math.min(4, commissionRates.length); level++) {
    const ref =
      typeof referralMap === "function"
        ? referralMap(current)
        : referralMap[current] || null;
    if (!ref) break; // no more upline
    const rate = commissionRates[level] || 0;
    const commission = Number((amount * rate).toFixed(2));
    if (commission > 0) {
      // credit upline
      wallets.adminCredit(ref, commission, {
        type: "MLM_COMMISSION",
        from: userId,
        level,
      });
    }
    current = ref;
  }
}

module.exports = { distributeCommissions };
