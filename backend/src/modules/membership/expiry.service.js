const User = require("../../models/User");
const Product = require("../../models/Product");
const { notify } = require("../../services/notification.service");

const PLATFORM_ID = process.env.PLATFORM_WALLET_USER_ID;
if (!PLATFORM_ID) throw new Error("Missing env PLATFORM_WALLET_USER_ID");

const DAY = 24 * 3600 * 1000;
const BATCH = 200;
const ACTIVE = { accountCategory: "network", membershipStatus: "active", _id: { $ne: PLATFORM_ID } };

// Active members whose end date has passed become "expired" and their shop is paused
async function expireLapsed(endAt, stats) {
  while (Date.now() < endAt) {
    const now = new Date();
    const batch = await User.find({ ...ACTIVE, membershipExpiresAt: { $lte: now } }).select("_id").limit(BATCH).lean();
    if (!batch.length) return true;
    const ids = batch.map((b) => b._id);

    // The same filter again: anyone who renewed a moment ago is skipped, not expired
    await User.updateMany(
      { _id: { $in: ids }, ...ACTIVE, membershipExpiresAt: { $lte: now } },
      { $set: { membershipStatus: "expired", commissionEligible: false } }
    );
    const done = (await User.find({ _id: { $in: ids }, membershipStatus: "expired" }).select("_id").lean()).map((d) => d._id);
    if (!done.length) continue;

    await Product.updateMany({ sellerId: { $in: done }, isShelved: true }, { $set: { isShelved: false, hiddenByExpiry: true } });
    for (const id of done) await notify("MEMBERSHIP_EXPIRED", id);
    stats.expired += done.length;
  }
  return false;
}

// One reminder per member per expiry date. The claim is atomic, so two job runs can never double-send.
async function remind({ field, fromDays, toDays, stat }, endAt, stats) {
  while (Date.now() < endAt) {
    const now = new Date();
    const lo = new Date(now.getTime() + fromDays * DAY);
    const hi = new Date(now.getTime() + toDays * DAY);
    const unsent = { $expr: { $ne: [`$${field}`, "$membershipExpiresAt"] } };

    const batch = await User.find({ ...ACTIVE, membershipExpiresAt: { $gt: lo, $lte: hi }, ...unsent })
      .select("membershipExpiresAt").limit(BATCH).lean();
    if (!batch.length) return;

    for (const u of batch) {
      const claimed = await User.findOneAndUpdate(
        { _id: u._id, ...ACTIVE, membershipExpiresAt: u.membershipExpiresAt, ...unsent },
        { $set: { [field]: u.membershipExpiresAt } },
        { projection: { _id: 1 } }
      );
      if (!claimed) continue;
      await notify("MEMBERSHIP_EXPIRING", u._id, { days: Math.max(1, Math.ceil((u.membershipExpiresAt - now) / DAY)) });
      stats[stat] += 1;
    }
  }
}

async function runExpirySweep(budgetMs) {
  const endAt = Date.now() + budgetMs;
  const stats = { expired: 0, reminded7: 0, reminded1: 0, finished: false };
  stats.finished = await expireLapsed(endAt, stats);
  await remind({ field: "expiryRemind7For", fromDays: 1, toDays: 7, stat: "reminded7" }, endAt, stats); // 1 to 7 days left
  await remind({ field: "expiryRemind1For", fromDays: 0, toDays: 1, stat: "reminded1" }, endAt, stats); // under 1 day left
  return stats;
}

module.exports = { runExpirySweep };
