module.exports = {
  WINDOW_DAYS: 30,
  PASS_SCORE: 3,            // pass at least 3 of the 5 checks
  MIN_NEW_RECRUITS: 1,
  MIN_TRANSACTIONS: 5,
  MIN_TX_AMOUNT: 50,
  TX_TYPES: ["deposit", "withdrawal", "product_purchase", "receive_transfer", "send_transfer"],
  MIN_PRODUCTS: 1,
  MIN_ORDERS: 1,
  MIN_ORDER_AMOUNT: 200,
  MIN_ACTIVE_DAYS: 5,
  GRACE_DAYS: 0,
  STALE_HOURS: 20,          // a member is re-checked once their last check is this old
  BATCH: 300,
  // Nairobi calendar day, e.g. "2026-10-18"
  dayKey: (d) => new Date(d.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10),
};
