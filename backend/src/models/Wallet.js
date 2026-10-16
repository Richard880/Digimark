const mongoose = require("mongoose");
const crypto = require("crypto");

// Money is stored as INTEGER whole shillings. Never store decimals.
const money = (extra = {}) => ({
  type: Number,
  required: true,
  default: 0,
  min: 0,
  validate: { validator: Number.isSafeInteger, message: "Amount must be a whole number" },
  ...extra,
});

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // unique already creates the index
    },
    // Only ever change with atomic $inc and a $gte filter in the same query.
    // Schema validators do NOT run on findOneAndUpdate.
    balance: money(),
    escrowBalance: money(),

    // Journal. NOTE: move to a separate collection before scale (16MB document limit).
    transactions: [
      {
        transactionId: {
          type: String,
          required: true,
          default: () => `TXN-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
        },
        amount: { type: Number, required: true }, // signed: negative = outflow
        type: {
          type: String,
          required: true,
          enum: [
            "deposit",
            "receive_transfer",
            "affiliate_commission",
            "network_commission",
            "product_purchase",
            "send_transfer",
            "matrix_subscription",
            "withdrawal",
          ],
        },
        status: {
          type: String,
          enum: ["PENDING", "COMPLETED", "FAILED", "ESCROW_HELD"],
          default: "COMPLETED",
        },
        referenceId: { type: String, default: null }, // order _id, M-Pesa CheckoutRequestID, etc.
        description: { type: String, trim: true, default: "" },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    isFrozen: { type: Boolean, default: false },
  },
  { timestamps: true }
);

walletSchema.index({ "transactions.referenceId": 1 });

module.exports = mongoose.models.Wallet || mongoose.model("Wallet", walletSchema);
