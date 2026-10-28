const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    fromPlan: String, toPlan: String,
    amount: { type: Number, required: true, min: 1 },
    idempotencyKey: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });

module.exports = mongoose.models.PlanChange || mongoose.model("PlanChange", schema);
