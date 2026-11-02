const Product = require("../../models/Product");
const User = require("../../models/User");
const UserProfile = require("../../models/UserProfile");
const Wallet = require("../../models/Wallet");

const H = 3600 * 1000;
const MIN_LEAD_MS = 25 * H;
const PRICE_RISE = 0.10, PRICE_BAND = 0.05;
const PF = "name price deliveryFee quantity sellerId barcode status isShelved shopScore";
const norm = (s) => String(s || "").trim().toLowerCase();
const VISIBLE = { status: { $in: ["LISTED", "ACTIVE"] }, isShelved: { $ne: false } };
const isVisible = (p) => !!p && ["LISTED", "ACTIVE"].includes(p.status) && p.isShelved !== false;

async function liveSellers(ids) {
  const uniq = [...new Set(ids.map(String))];
  if (!uniq.length) return new Set();
  const rows = await User.find({ _id: { $in: uniq }, accountCategory: "network", membershipStatus: "active", isActive: true,
    $or: [{ membershipExpiresAt: null }, { membershipExpiresAt: { $gt: new Date() } }] }).select("_id").lean();
  return new Set(rows.map((r) => String(r._id)));
}
async function profiles(ids) {
  const uniq = [...new Set(ids.map(String))];
  if (!uniq.length) return new Map();
  const rows = await UserProfile.find({ userId: { $in: uniq } }).select("userId brandName displayName username location").lean();
  return new Map(rows.map((p) => [String(p.userId), p]));
}

function addCycle(d, repeat) {
  const x = new Date(d);
  if (repeat === "daily") x.setUTCDate(x.getUTCDate() + 1);
  else if (repeat === "weekly") x.setUTCDate(x.getUTCDate() + 7);
  else if (repeat === "biweekly") x.setUTCDate(x.getUTCDate() + 14);
  else if (repeat === "monthly") {
    const day = x.getUTCDate();
    x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + 1);
    x.setUTCDate(Math.min(day, new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate()));
  }
  return x;
}
// The next delivery that still leaves time to order. null if a one-off list's time has gone.
function rollForward(list) {
  let d = new Date(list.deliveryAt);
  if (list.repeat === "none") return d.getTime() - Date.now() >= MIN_LEAD_MS ? d : null;
  for (let i = 0; i < 400 && d.getTime() - Date.now() < MIN_LEAD_MS; i++) d = addCycle(d, list.repeat);
  return d;
}

// "Pick for me": same barcode, in stock, same county, live shop, not blocked.
// Among shops within 5% of the cheapest, the nearest wins, then the shop score, then the price.
async function pickVendor(it, ref, { buyerId, blocked, county, sub }) {
  const code = it.barcode || ref?.barcode;
  if (!code || !county) return null;
  const cands = await Product.find({ barcode: code, ...VISIBLE, quantity: { $gte: it.quantity }, sellerId: { $nin: [buyerId, ...blocked] } }).limit(60).select(PF).lean();
  if (!cands.length) return null;
  const live = await liveSellers(cands.map((c) => c.sellerId));
  const profs = await profiles([...live]);
  const ok = cands.filter((c) => live.has(String(c.sellerId)) && norm(profs.get(String(c.sellerId))?.location?.county) === county)
    .map((c) => ({ c, cost: c.price * it.quantity + (c.deliveryFee || 0), near: norm(profs.get(String(c.sellerId))?.location?.subCounty) === sub && sub ? 2 : 1 }));
  if (!ok.length) return null;
  const cheapest = Math.min(...ok.map((x) => x.cost));
  const best = ok.filter((x) => x.cost <= cheapest * (1 + PRICE_BAND))
    .sort((a, b) => b.near - a.near || (b.c.shopScore ?? 20) - (a.c.shopScore ?? 20) || a.cost - b.cost)[0];
  return best.c;
}

// What would happen if this list were ordered right now. Used for the review screen and by the scheduler.
async function review(list) {
  const buyerId = String(list.buyerId);
  const refs = new Map((await Product.find({ _id: { $in: list.items.map((i) => i.productId) } }).select(PF).lean()).map((p) => [String(p._id), p]));
  const ctx = { buyerId, blocked: (list.blockedSellers || []).map(String), county: norm(list.address?.county), sub: norm(list.address?.subCounty) };

  const picks = [];
  for (const it of list.items) {
    const ref = refs.get(String(it.productId));
    const chosen = it.mode === "auto" ? await pickVendor(it, ref, ctx) : ref && String(ref.sellerId) !== buyerId ? ref : null;
    picks.push({ it, chosen });
  }
  const sellerIds = picks.filter((p) => p.chosen).map((p) => p.chosen.sellerId);
  const [live, profs] = await Promise.all([liveSellers(sellerIds), profiles(sellerIds)]);

  const rows = picks.map(({ it, chosen }) => {
    let status = "ok";
    if (!chosen) status = it.mode === "auto" ? "no_vendor" : "unavailable";
    else if (!isVisible(chosen) || !live.has(String(chosen.sellerId))) status = "unavailable";
    else if (chosen.quantity < it.quantity) status = "out_of_stock";
    else if (it.approvedPrice != null && chosen.price > Math.round(it.approvedPrice * (1 + PRICE_RISE))) status = "price_up";
    const p = chosen ? profs.get(String(chosen.sellerId)) : null;
    return { itemId: String(it._id), mode: it.mode, name: chosen?.name || it.name, quantity: it.quantity, status,
      productId: chosen ? String(chosen._id) : String(it.productId), sellerId: chosen ? String(chosen.sellerId) : null,
      sellerName: p?.brandName || p?.displayName || "", unitPrice: chosen ? chosen.price : null,
      lineTotal: chosen ? chosen.price * it.quantity + (chosen.deliveryFee || 0) : 0 };
  });
  const total = rows.filter((r) => r.status === "ok").reduce((t, r) => t + r.lineTotal, 0);
  const w = await Wallet.findOne({ userId: list.buyerId }).select("balance isFrozen").lean();
  const balance = w?.balance || 0;
  return { rows, total, wallet: { balance, frozen: !!w?.isFrozen }, short: Math.max(0, total - balance) };
}

module.exports = { review, addCycle, rollForward, MIN_LEAD_MS };
