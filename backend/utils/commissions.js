// utils/commissions.js
const wallets = require("../data/wallets");
const fs = require("fs");
const path = require("path");

const USERS_DB = path.join(__dirname, "../data/mlm_users.json");

// Commission rates for levels 1..4
const RATES = [0.25, 0.15, 0.09, 0.06];

function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_DB, "utf8") || "[]");
  } catch {
    return [];
  }
}

function findUserById(id, users) {
  return users.find((u) => u.id === id) || null;
}

// walk up to n levels and return array of {userId, level}
function walkUpline(userId, levels = 4) {
  const users = readUsers();
  const chain = [];
  let current = findUserById(userId, users);
  if (!current) return chain;
  // immediate referrer is the one who referred current (upline)
  let ref = current.parentId || current.refId || null;
  let level = 1;
  while (ref && level <= levels) {
    const u = findUserById(ref, users);
    if (!u) break;
    chain.push({ userId: u.id, level });
    ref = u.parentId || u.refId || null;
    level++;
  }
  return chain;
}

/**
 * applyCommissions
 *  - saleUserId = user who created sale (the buyer or the one whose activity triggers commission)
 *  - saleAmount = amount the sale generated
 *  - meta: optional object to attach to txs (saleId, note)
 */
function applyCommissions(saleUserId, saleAmount, meta = {}) {
  const recipients = walkUpline(saleUserId, RATES.length);
  const results = [];
  recipients.forEach((r) => {
    const rate = RATES[r.level - 1] || 0;
    if (rate <= 0) return;
    const commission = +(saleAmount * rate).toFixed(6);
    if (commission <= 0) return;
    // credit wallet
    // wallets.createWalletIfMissing(r.userId);
    // const tx = wallets.deposit(r.userId, commission, `commission L${r.level}`);
    const { wallet, tx } = wallets.deposit(r.userId, commission, {
      note: `commission L${r.level}`,
    });

    results.push({ userId: r.userId, level: r.level, commission, txId: tx.id });

    // add meta into last tx (not modifying internal tx shape, but you can track via separate storage)
    // results.push({ userId: r.userId, level: r.level, commission, txId: tx.id });
  });
  return results;
}

module.exports = {
  applyCommissions,
  walkUpline,
  RATES,
};
