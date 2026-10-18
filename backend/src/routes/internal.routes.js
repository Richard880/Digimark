const express = require("express");
const crypto = require("crypto");
const { runEligibilitySweep } = require("../modules/membership/eligibility.service");

const router = express.Router();

function authorized(req) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.get("Authorization") || "");
  const secret = process.env.CRON_SECRET || "";
  if (!m || secret.length < 24) return false;
  const a = Buffer.from(m[1]), b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Called by Vercel Cron (it sends "Authorization: Bearer <CRON_SECRET>")
router.get("/eligibility", async (req, res) => {
  if (!authorized(req)) return res.sendStatus(404); // look like it doesn't exist
  try {
    const stats = await runEligibilitySweep(Number(process.env.CRON_BUDGET_MS) || 8000);
    return res.json({ ok: true, ...stats });
  } catch (e) {
    console.error("❌ eligibility sweep:", e.stack || e.message);
    return res.status(500).json({ error: "SWEEP_FAILED" });
  }
});

module.exports = router;
