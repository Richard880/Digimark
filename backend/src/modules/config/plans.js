module.exports = {
  // earnDepth = how many levels this plan can earn from.
  // 4 for every plan = fee only. Set 1/2/3/4 to make higher plans unlock deeper levels.
  PLANS: {
    phase1: { name: "Phase 1", fee: 100,  earnDepth: 4 },
    phase2: { name: "Phase 2", fee: 200,  earnDepth: 4 },
    phase3: { name: "Phase 3", fee: 500,  earnDepth: 4 },
    phase4: { name: "Phase 4", fee: 1000, earnDepth: 4 },
  },
  LEVELS: [
    { level: 1, bp: 2500 }, // 25%
    { level: 2, bp: 1500 }, // 15%
    { level: 3, bp: 900 },  // 9%
    { level: 4, bp: 600 },  // 6%
  ],
  ROLLUP_MAX_STEPS: Math.min(2, Math.max(1, parseInt(process.env.ROLLUP_MAX_STEPS, 10) || 2)),
  PERIOD_DAYS: 30,
  RENEW_WINDOW_DAYS: 7, // renewals are accepted only in the last 7 days (no stockpiling months)
};
