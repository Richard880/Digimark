// utils/wallet.js
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "../data/wallets.json");
const LOCK = {};

// ensure data dir + file exists
const ensure = () => {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH))
    fs.writeFileSync(DB_PATH, JSON.stringify({}), "utf8");
};

// basic sync load/save (safe enough for dev)
function loadAll() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8") || "{}");
  } catch (e) {
    return {};
  }
}
function saveAll(data) {
  ensure();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

function getWallet(userId) {
  const all = loadAll();
  return all[userId] || null;
}

function initWallet(userId, { balance = 0, rate = 1 } = {}) {
  const all = loadAll();
  all[userId] = all[userId] || {};
  all[userId].balance = Number(balance);
  all[userId].rate = Number(rate); // units per second
  all[userId].updatedAt = Date.now();
  saveAll(all);
  return all[userId];
}

/**
 * Deduct cost for a segment (segmentSeconds) from a user's wallet.
 * Returns { ok: boolean, balance }
 */
function deductForSegment(userId, segmentSeconds = 4) {
  const all = loadAll();
  const w = all[userId];
  if (!w) return { ok: false, reason: "NO_WALLET", balance: 0 };

  const cost = (w.rate || 1) * segmentSeconds;
  if (w.balance <= 0 || w.balance < cost) {
    w.balance = Number(w.balance || 0);
    all[userId] = w;
    saveAll(all);
    return { ok: false, reason: "INSUFFICIENT", balance: w.balance || 0 };
  }

  w.balance = Math.max(0, Number(w.balance) - cost);
  w.updatedAt = Date.now();
  all[userId] = w;
  saveAll(all);
  return { ok: true, balance: w.balance };
}

module.exports = {
  getWallet,
  initWallet,
  deductForSegment,
  loadAll,
  saveAll,
};
