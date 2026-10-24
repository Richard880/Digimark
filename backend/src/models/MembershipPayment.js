const mongoose = require("mongoose");
const { Schema } = mongoose;

const payoutSchema = new Schema(
  {
    level: Number, // 0 = company base share
    payeeId: Schema.Types.ObjectId,
    amount: Number,
    kind: { type: String, enum: ["commission", "rollup", "breakage", "company"] },
    steps: { type: Number, default: 0 }, // how far the money rolled up
  },
  { _id: false }
);

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    plan: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    kind: { type: String, enum: ["activation", "renewal"], required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    idempotencyKey: { type: String, required: true },
    acknowledgedExplainer: { type: Boolean, default: false },
    explainerVersion: { type: String, default: "" },
    payouts: [payoutSchema], // audit trail of exactly where every shilling went
  },
  { timestamps: true }
);

schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true }); // retries never double-charge
schema.index({ userId: 1, periodEnd: 1 }, { unique: true });      // one payment per period, even with different keys

module.exports = mongoose.models.MembershipPayment || mongoose.model("MembershipPayment", schema);
