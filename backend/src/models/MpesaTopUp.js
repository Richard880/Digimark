const mongoose = require("mongoose");

const topUpSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    checkoutRequestId: { type: String, required: true, unique: true },
    merchantRequestId: { type: String },
    phone: { type: String, required: true },
    // Whole shillings, as requested at initiation. This is the amount we trust.
    amount: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED", "REVIEW"], // REVIEW = amount mismatch, needs a human
      default: "PENDING",
      index: true,
    },
    mpesaReceipt: { type: String },
    failReason: { type: String, maxlength: 200 },
    completedAt: Date,
  },
  { timestamps: true }
);

// The same M-Pesa receipt can never credit two wallets
topUpSchema.index(
  { mpesaReceipt: 1 },
  { unique: true, partialFilterExpression: { mpesaReceipt: { $type: "string" } } }
);

module.exports = mongoose.models.MpesaTopUp || mongoose.model("MpesaTopUp", topUpSchema);
