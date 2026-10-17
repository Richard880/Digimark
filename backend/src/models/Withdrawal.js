const mongoose = require("mongoose");

const withdrawalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    phone: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    originatorConversationId: { type: String, required: true, unique: true },
    conversationId: String,
    status: {
      type: String,
      enum: ["PENDING_PAYOUT", "SUBMITTED", "COMPLETED", "FAILED", "REVIEW"],
      default: "PENDING_PAYOUT",
      index: true,
    },
    mpesaReceipt: String,
    failReason: { type: String, maxlength: 200 },
    completedAt: Date,
  },
  { timestamps: true }
);

withdrawalSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
withdrawalSchema.index({ userId: 1, createdAt: -1 });
withdrawalSchema.index(
  { mpesaReceipt: 1 },
  { unique: true, partialFilterExpression: { mpesaReceipt: { $type: "string" } } }
);

module.exports = mongoose.models.Withdrawal || mongoose.model("Withdrawal", withdrawalSchema);
