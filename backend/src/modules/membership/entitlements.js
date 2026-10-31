const { PLANS, PLAN_ORDER } = require("../config/plans");

const DAY = 86400000;

const isActive = (u, now = new Date()) =>
  !!u && u.accountCategory === "network" && u.membershipStatus === "active" && (!u.membershipExpiresAt || u.membershipExpiresAt > now);

function entitlementsFor(u) {
  const key = PLANS[u?.plan] ? u.plan : "phase1";
  const p = PLANS[key];
  const active = isActive(u);
  // Lapsed: read-only, but exporting your own data always works
  return { planKey: key, name: p.name, active, readOnly: !active, earnDepth: p.earnDepth, limits: p.limits, features: active ? p.features : { export: true } };
}

const cheapest = (test) => PLAN_ORDER.find((k) => test(PLANS[k])) || null;

function upgradeQuote(u, toKey, now = new Date()) {
  if (!isActive(u) || !PLANS[toKey]) return null;
  const from = PLANS[u.plan] ? u.plan : "phase1";
  if (PLAN_ORDER.indexOf(toKey) <= PLAN_ORDER.indexOf(from)) return null;
  const left = u.membershipExpiresAt ? Math.min(30, Math.max(1, Math.ceil((u.membershipExpiresAt - now) / DAY))) : 30;
  return { from, amount: Math.ceil(((PLANS[toKey].fee - PLANS[from].fee) * left) / 30) };
}

const requireFeature = (feature) => (req, res, next) => {
  const ent = entitlementsFor(req.shop ? req.shop.owner : req.user);
  if (ent.features[feature]) { req.ent = ent; return next(); }
  return res.status(403).json({ error: "PLAN_UPGRADE_REQUIRED", feature, requiredPlan: cheapest((p) => p.features[feature]) });
};


module.exports = { entitlementsFor, upgradeQuote, requireFeature, cheapest, isActive };
