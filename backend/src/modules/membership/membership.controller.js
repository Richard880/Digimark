const { payMembership } = require("../../../services/membershipService");
const { PLANS, PERIOD_DAYS } = require("../config/plans");
const { evaluateUsers } = require("./eligibility.service");
const C = require("../config/activity");

// GET /api/membership/plans (public)
function listPlans(_req, res) {
  const plans = Object.entries(PLANS).map(([key, p]) => ({ key, name: p.name, fee: p.fee, days: PERIOD_DAYS }));
  return res.json({ ok: true, plans });
}

// GET /api/membership/me
function myMembership(req, res) {
  const u = req.user;
  return res.json({
    ok: true,
    status: u.membershipStatus,
    plan: u.plan || null,
    expiresAt: u.membershipExpiresAt || null,
    commissionEligible: !!u.commissionEligible,
  });
}

// POST /api/membership/pay   body: { plan }   header: Idempotency-Key
async function pay(req, res) {
  try {
    const key = req.get("Idempotency-Key");
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(key || "")) return res.status(400).json({ error: "IDEMPOTENCY_KEY_REQUIRED" });
    const planKey = req.body && req.body.plan;
    if (typeof planKey !== "string" || !Object.prototype.hasOwnProperty.call(PLANS, planKey)) {
      return res.status(400).json({ error: "INVALID_PLAN" });
    }

    const r = await payMembership({ userId: req.user._id, planKey, idempotencyKey: key, ack: req.body?.ack === true });
    return res.status(r.replay ? 200 : 201).json({
      ok: true, plan: r.plan, amount: r.amount, expiresAt: r.periodEnd, activated: !!r.activated,
    });
  } catch (err) {
    if (err && typeof err.code === "string" && Number.isInteger(err.status)) {
      const body = { error: err.code };
      if (err.required !== undefined) { body.required = err.required; body.currentBalance = err.currentBalance; }
      return res.status(err.status).json(body);
    }
    console.error("❌ membership pay:", err.stack || err.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}



// GET /api/membership/activity
async function myActivity(req, res) {
  try {
    if (req.userCategory !== "network") return res.status(403).json({ error: "NETWORK_MEMBERSHIP_REQUIRED" });
    const r = (await evaluateUsers([req.user])).get(String(req.user._id));
    return res.json({
      ok: true,
      eligible: r.eligible,
      score: r.score,
      passMark: C.PASS_SCORE,
      inGrace: r.inGrace,
      windowDays: C.WINDOW_DAYS,
      checks: [
        { key: "growth", label: "New active recruits", value: r.values.growth, target: C.MIN_NEW_RECRUITS, passed: r.checks.growth },
        { key: "transactions", label: "Wallet transactions", value: r.values.transactions, target: C.MIN_TRANSACTIONS, passed: r.checks.transactions },
        { key: "products", label: "Products listed", value: r.values.products, target: C.MIN_PRODUCTS, passed: r.checks.products },
        { key: "deliveries", label: "Completed orders", value: r.values.deliveries, target: C.MIN_ORDERS, passed: r.checks.deliveries },
        { key: "activeDays", label: "Days active", value: r.values.activeDays, target: C.MIN_ACTIVE_DAYS, passed: r.checks.activeDays },
      ],
    });
  } catch (e) {
    console.error("❌ myActivity:", e.stack || e.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

module.exports = { listPlans, myMembership, pay, myActivity };
