const H = 3600 * 1000, D = 24 * H;
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

const CONFIRM_WINDOW_MS = num(process.env.CONFIRM_WINDOW_HOURS, 48) * H;
const PROTECTION_MS = num(process.env.PROTECTION_DAYS, 7) * D;

module.exports = {
  CONFIRM_WINDOW_MS,
  CONFIRM_REMIND_AFTER_MS: Math.max(H, CONFIRM_WINDOW_MS - 24 * H), // remind when 24 h are left
  PROTECTION_MS,
  REMIND1_AFTER_MS: Math.floor((PROTECTION_MS * 3) / 7),
  REMIND2_AFTER_MS: PROTECTION_MS - D,                              // remind when 1 day is left
  SELLER_DISPUTE_AFTER_MS: Math.floor((PROTECTION_MS * 3) / 7),     // sellers can open a dispute after day 3
  MAX_DISPUTE_MESSAGES: 30,
};
