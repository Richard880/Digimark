// src/modules/config/plans.js  (or wherever your plans.js lives)

module.exports = {
  PLANS: {
    phase1: {
      name: "Solo Retailer",
      fee: 100,
      earnDepth: 1,
      maxProducts: 50,
      maxPosDevices: 1,
      maxStaff: 0,
      maxBranches: 1,
      smsPerMonth: 0,
      canPromoteOthersProducts: false,
      multiWarehouse: false,
      advancedReporting: false,
    },
    phase2: {
      name: "Merchant Pro",
      fee: 200,
      earnDepth: 2,
      maxProducts: 2000,
      maxPosDevices: 1,
      maxStaff: 0,
      maxBranches: 1,
      smsPerMonth: 50,
      canPromoteOthersProducts: true,
      multiWarehouse: false,
      advancedReporting: false,
    },
    phase3: {
      name: "Smart-Hub",
      fee: 500,
      earnDepth: 3,
      maxProducts: 10000,
      maxPosDevices: 5,
      maxStaff: 10,
      maxBranches: 5,
      smsPerMonth: 200,
      canPromoteOthersProducts: true,
      multiWarehouse: true,
      advancedReporting: true,
    },
    phase4: {
      name: "Omnichannel",
      fee: 1000,
      earnDepth: 4,
      maxProducts: 50000,
      maxPosDevices: 20,
      maxStaff: 50,
      maxBranches: 20,
      smsPerMonth: 500,
      canPromoteOthersProducts: true,
      multiWarehouse: true,
      advancedReporting: true,
    },
  },

  LEVELS: [
    { level: 1, bp: 2500 }, // 25%
    { level: 2, bp: 1500 }, // 15%
    { level: 3, bp: 900 },  // 9%
    { level: 4, bp: 600 },  // 6%
  ],

  ROLLUP_MAX_STEPS: Math.min(2, Math.max(1, parseInt(process.env.ROLLUP_MAX_STEPS, 10) || 2)),
  PERIOD_DAYS: 30,
  RENEW_WINDOW_DAYS: 7,
};
