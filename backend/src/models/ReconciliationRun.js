const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  at: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 },
  ok: { type: Boolean, required: true },
  figures: { type: mongoose.Schema.Types.Mixed, default: {} },
  issues: [{ _id: false, code: String, severity: { type: String, enum: ["critical", "warning"] }, detail: String }],
});
schema.index({ at: -1 });

module.exports = mongoose.models.ReconciliationRun || mongoose.model("ReconciliationRun", schema);
