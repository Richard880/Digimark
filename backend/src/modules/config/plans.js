const PLAN_ORDER = ["phase1", "phase2", "phase3", "phase4"];

const F1 = { pos: true, export: true, stockHistory: true, lowStockInApp: true, receiptsPdf: true, dailyReport: true };
const F2 = { ...F1, promoteOthers: true, barcodes: true, thermalPrint: true, customers: true, creditSales: true, suppliers: true, profitReports: true, lowStockSms: true, csvImport: true };
const F3 = { ...F2, multiTerminal: true, staffRoles: true, shifts: true, multiBranch: true, auditLog: true };
const F4 = { ...F3, apiAccess: true, accountingExport: true, prioritySync: true, prioritySupport: true };

const PLANS = {
  phase1: { name: "Solo Retailer", fee: 100, earnDepth: 1, limits: { products: 50, terminals: 1, staff: 0, branches: 1, smsPerMonth: 0 }, features: F1 },
  phase2: { name: "Merchant Pro", fee: 200, earnDepth: 2, limits: { products: 2000, terminals: 1, staff: 0, branches: 1, smsPerMonth: 50 }, features: F2 },
  phase3: { name: "Smart-Hub", fee: 500, earnDepth: 3, limits: { products: 10000, terminals: 5, staff: 10, branches: 5, smsPerMonth: 200 }, features: F3 },
  phase4: { name: "Omnichannel", fee: 1000, earnDepth: 4, limits: { products: 50000, terminals: 20, staff: 50, branches: 20, smsPerMonth: 500 }, features: F4 },
};

// Features that exist TODAY. Add a name here only when it ships; the app labels the rest "Coming soon".
const BUILT = ["pos", "export",
               "stockHistory", "lowStockInApp",
               "promoteOthers", "receiptsPdf",
               "dailyReport", "customers",
               "creditSales", "barcodes",
               "suppliers",
               "multiTerminal", "staffRoles", 
               "multiBranch", "auditLog"];

module.exports = {
  PLANS, PLAN_ORDER, BUILT,
  LEVELS: [{ level: 1, bp: 2500 }, { level: 2, bp: 1500 }, { level: 3, bp: 900 }, { level: 4, bp: 600 }],
  ROLLUP_MAX_STEPS: Math.min(2, Math.max(1, parseInt(process.env.ROLLUP_MAX_STEPS, 10) || 2)),
  PERIOD_DAYS: 30,
  RENEW_WINDOW_DAYS: 7,
};
