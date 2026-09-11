// data/wallets.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DB = path.join(__dirname, "wallets.json");

function read() {
  try {
    return JSON.parse(fs.readFileSync(DB, "utf8") || "[]");
  } catch {
    return [];
  }
}
function write(data) {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

/* ---------- helpers ---------- */
function ensure() {
  if (!fs.existsSync(DB)) write([]);
  const data = read();
  // normalize existing wallets
  let changed = false;
  data.forEach((w) => {
    if (!Array.isArray(w.transactions)) {
      w.transactions = [];
      changed = true;
    }
    if (typeof w.balance !== "number") {
      w.balance = 0;
      changed = true;
    }
    if (!w.userId) {
      w.userId = "u_" + crypto.randomBytes(4).toString("hex");
      changed = true;
    }
  });
  if (changed) write(data);
}

/* ---------- CRUD ---------- */
function getWallet(userId) {
  ensure();
  const data = read();
  return data.find((w) => w.userId === userId) || null;
}
function createWallet(userId, initial = 0) {
  ensure();
  const data = read();
  if (data.find((w) => w.userId === userId)) return getWallet(userId);
  const w = {
    userId,
    balance: Number(initial) || 0,
    transactions: [],
    createdAt: new Date().toISOString(),
  };
  data.push(w);
  write(data);
  return w;
}

// function save(wallet) {
//   const data = read();
//   const i = data.findIndex((w) => {
//     w.userId === wallet.userId;
//   });
//   if (i !== -1) {
//     data[i] = wallet;
//     write(data);
//   }
// }
function save(wallet) {
  const data = read();
  // FIX: Added explicit return evaluation shorthand
  const i = data.findIndex((w) => w.userId === wallet.userId);
  if (i !== -1) {
    data[i] = wallet;
    write(data);
  }
}

/* ---------- transactions ---------- */

function addTransaction(userId, type, amount, meta = {}) {
  if (typeof userId === "undefined") throw new Error("userId required");
  const data = read();
  let w = data.find((x) => x.userId === userId);
  if (!w) {
    // create locally and push into data (don't call createWallet which writes separately)
    w = {
      userId,
      balance: 0,
      transactions: [],
      createdAt: new Date().toISOString(),
    };
    data.push(w);
  }
  if (!Array.isArray(w.transactions)) w.transactions = [];
  const tx = {
    id: "tx_" + crypto.randomBytes(6).toString("hex"),
    type,
    amount: Number(amount),
    balanceAfter: Number(w.balance),
    meta,
    createdAt: new Date().toISOString(),
  };
  w.transactions.unshift(tx);
  write(data);
  return tx;
}

/* ---------- main operations ---------- */

function deposit(userId, amount, meta = {}) {
  if (amount <= 0) throw new Error("amount must be > 0");
  const data = read();
  let w = data.find((x) => x.userId === userId);
  if (!w) {
    w = {
      userId,
      balance: 0,
      transactions: [],
      createdAt: new Date().toISOString(),
    };
    data.push(w);
  }
  w.balance = Number(w.balance) + Number(amount);
  const tx = {
    id: "tx_" + crypto.randomBytes(6).toString("hex"),
    type: "DEPOSIT",
    amount: Number(amount),
    balanceAfter: Number(w.balance),
    meta,
    createdAt: new Date().toISOString(),
  };
  w.transactions.unshift(tx);
  write(data);
  return { wallet: w, tx };
}

function withdraw(userId, amount, meta = {}) {
  if (amount <= 0) throw new Error("amount must be > 0");
  const data = read();
  const w = data.find((x) => x.userId === userId);
  if (!w) throw new Error("WALLET_NOT_FOUND");
  if (w.balance < amount) return { ok: false, error: "INSUFFICIENT_FUNDS" };
  w.balance -= Number(amount);
  const tx = {
    id: "tx_" + crypto.randomBytes(6).toString("hex"),
    type: "WITHDRAW",
    amount: Number(amount),
    balanceAfter: Number(w.balance),
    meta,
    createdAt: new Date().toISOString(),
  };
  w.transactions.unshift(tx);
  write(data);
  return { ok: true, wallet: w, tx };
}

function transfer(fromUserId, toUserId, amount, meta = {}) {
  if (amount <= 0) throw new Error("amount must be > 0");
  const data = read();
  const from = data.find((x) => x.userId === fromUserId);
  if (!from) throw new Error("SENDER_WALLET_NOT_FOUND");
  if (from.balance < amount) return { ok: false, error: "INSUFFICIENT_FUNDS" };
  let to = data.find((x) => x.userId === toUserId);
  if (!to) {
    to = {
      userId: toUserId,
      balance: 0,
      transactions: [],
      createdAt: new Date().toISOString(),
    };
    data.push(to);
  }

  from.balance -= Number(amount);
  to.balance += Number(amount);

  const txFrom = {
    id: "tx_" + crypto.randomBytes(6).toString("hex"),
    type: "TRANSFER_OUT",
    amount: Number(amount),
    to: toUserId,
    balanceAfter: Number(from.balance),
    meta,
    createdAt: new Date().toISOString(),
  };
  from.transactions.unshift(txFrom);

  const txTo = {
    id: "tx_" + crypto.randomBytes(6).toString("hex"),
    type: "TRANSFER_IN",
    amount: Number(amount),
    from: fromUserId,
    balanceAfter: Number(to.balance),
    meta,
    createdAt: new Date().toISOString(),
  };
  to.transactions.unshift(txTo);

  write(data);
  return { ok: true, from, to, txFrom, txTo };
}

function activateFloat(userId, plan) {
  const now = new Date();
  let expiresAt;

  if (plan === "24h") expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  else if (plan === "7d")
    expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  else if (plan === "30d")
    expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  else return { ok: false, error: "INVALID_PLAN" };

  const data = read();
  let w = data.find((x) => x.userId === userId);
  if (!w) {
    w = { userId, balance: 0, transactions: [] };
    data.push(w);
  }

  w.float = {
    plan,
    status: "active",
    expiresAt: expiresAt.toISOString(),
  };

  w.transactions.unshift({
    id: "tx_" + crypto.randomBytes(6).toString("hex"),
    type: "FLOAT_SUBSCRIBE",
    plan,
    expiresAt: w.float.expiresAt,
    createdAt: new Date().toISOString(),
  });

  write(data);
  return { ok: true, wallet: w };
}

function hasActiveFloat(wallet) {
  if (!wallet?.float) return false;
  return (
    wallet.float.status === "active" &&
    new Date(wallet.float.expiresAt) > new Date()
  );
}

function purchaseSubscription(userId, months, price) {
  months = Number(months);
  if (months <= 0) return { ok: false, error: "INVALID_MONTHS" };
  const cost = months * Number(price);

  const data = read();
  let w = data.find((x) => x.userId === userId);
  if (!w) {
    w = {
      userId,
      balance: 0,
      transactions: [],
      createdAt: new Date().toISOString(),
    };
    data.push(w);
  }

  if (w.balance < cost) return { ok: false, error: "INSUFFICIENT_FUNDS" };
  w.balance -= cost;
  const tx = {
    id: "tx_" + crypto.randomBytes(6).toString("hex"),
    type: "PURCHASE_SUBSCRIPTION",
    amount: Number(cost),
    months,
    balanceAfter: Number(w.balance),
    createdAt: new Date().toISOString(),
  };
  if (!Array.isArray(w.transactions)) w.transactions = [];
  w.transactions.unshift(tx);
  write(data);
  return { ok: true, wallet: w, tx };
}

/* ---------- admin credit (top-up by admin) ---------- */
function adminCredit(userId, amount, meta = {}) {
  return deposit(userId, amount, { ...meta, by: "admin" });
}

/* ---------- ledger queries ---------- */
function getTransactions(userId, limit = 50, offset = 0) {
  const w = getWallet(userId);
  if (!w) return [];
  const list = w.transactions || [];
  return list.slice(offset, offset + limit);
}

/* ---------- export ---------- */
module.exports = {
  getWallet,
  createWallet,
  deposit,
  withdraw,
  transfer,
  activateFloat,
  purchaseSubscription,
  adminCredit,
  getTransactions,
  hasActiveFloat,
  save,
};
