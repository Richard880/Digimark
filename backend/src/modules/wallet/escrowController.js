const mongoose = require("mongoose");

const int = { type: Number, required: true, min: 0, validate: Number.isSafeInteger };

const escrowSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    affiliateId: { type: mongoose.Schema.Types.ObjectId, default: null },

    // all amounts are INTEGER minor units (cents)
    totalAmountHeld: int,
    vendorSplitAmount: int,
    affiliateBonusAmount: { ...int, default: 0 },
    platformCommissionAmount: int,

    status: {
      type: String,
      enum: ["SECURED", "DISBURSED", "REFUNDED"],
      default: "SECURED",
      index: true,
    },
    disbursedAt: Date,
    refundedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("EscrowAccount", escrowSchema);
