const express = require("express");
const crypto = require("crypto");
const { runEligibilitySweep } = require("../modules/membership/eligibility.service");
const { runExpirySweep } = require("../modules/membership/expiry.service");
const { runOrderTimers } = require("../modules/order/orderTimers.service");
const { runReconciliation } = require("../modules/admin/reconcile.service");

const router = express.Router();

function authorized(req) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.get("Authorization") || "");
  const secret = process.env.CRON_SECRET || "";
  if (!m || secret.length < 24) return false;
  const a = Buffer.from(m[1]), b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}



router.get("/orders", async (req, res) => {
  if (!authorized(req)) return res.sendStatus(404);
  try { return res.json({ ok: true, ...(await runOrderTimers(Number(process.env.CRON_BUDGET_MS) || 8000)) }); }
  catch (e) { console.error("❌ order timers:", e.stack || e.message); return res.status(500).json({ error: "JOB_FAILED" }); }
});

router.get("/reconcile", async (req, res) => {
  if (!authorized(req)) return res.sendStatus(404);
  try { return res.json({ ok: true, ...(await runReconciliation()) }); }
  catch (e) { console.error("❌ reconcile:", e.stack || e.message); return res.status(500).json({ error: "JOB_FAILED" }); }
});

// replace the existing /daily route
router.get("/daily", async (req, res) => {
  if (!authorized(req)) return res.sendStatus(404);
  try {
    const total = Number(process.env.CRON_BUDGET_MS) || 8000;
    const orders = await runOrderTimers(Math.floor(total * 0.4));
    const expiry = await runExpirySweep(Math.floor(total * 0.2));
    const eligibility = await runEligibilitySweep(Math.max(1000, Math.floor(total * 0.4)));
    const reconciliation = await runReconciliation();
    return res.json({ ok: true, orders, expiry, eligibility, reconciliation });
  } catch (e) {
    console.error("❌ daily job:", e.stack || e.message);
    return res.status(500).json({ error: "JOB_FAILED" });
  }
});



// Manual runs while testing
router.get("/expiry", async (req, res) => {
  if (!authorized(req)) return res.sendStatus(404);
  try { return res.json({ ok: true, ...(await runExpirySweep(Number(process.env.CRON_BUDGET_MS) || 8000)) }); }
  catch (e) { console.error("❌ expiry:", e.stack || e.message); return res.status(500).json({ error: "JOB_FAILED" }); }
});

router.get("/eligibility", async (req, res) => {
  if (!authorized(req)) return res.sendStatus(404);
  try { return res.json({ ok: true, ...(await runEligibilitySweep(Number(process.env.CRON_BUDGET_MS) || 8000)) }); }
  catch (e) { console.error("❌ eligibility:", e.stack || e.message); return res.status(500).json({ error: "JOB_FAILED" }); }
});

module.exports = router;
