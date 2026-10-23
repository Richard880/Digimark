const mongoose = require("mongoose");
const crypto = require("crypto");

const int = (extra = {}) => ({
  type: Number,
  min: 0,
  validate: { validator: Number.isSafeInteger, message: "Amount must be a whole number" },
  ...extra,
});

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      immutable: true,
      default: () => `SDO-${crypto.randomBytes(5).toString("hex").toUpperCase()}`,
    },

    // 6-digit delivery PIN. Hidden from every query by default.
    // Read it ONLY in the buyer's PIN endpoint: .select("+escrowReleasePin")
    escrowReleasePin: {
      type: String,
      required: true,
      select: false,
      immutable: true,
      default: () => String(crypto.randomInt(100000, 1000000)),
    },
    pinAttempts: { type: Number, default: 0, select: false },
    pinLockedUntil: { type: Date, default: null, select: false },

    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    // Marketer who drove the sale (passed to escrow as affiliateId)
    promoterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, immutable: true },

    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        name: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
        pricePaid: int({ required: true }), // price from DB at checkout, never from the client
        commissionAllocated: int({ default: 0 }),
      },
    ],

    shippingDetails: {
      fullName: { type: String, required: true, trim: true, maxlength: 80 },
      phoneNumber: { type: String, required: true, trim: true, match: /^\+?\d{9,15}$/ },
      county: { type: String, required: true, trim: true, maxlength: 40 },
      subCounty: { type: String, required: true, trim: true, maxlength: 40 },
      deliveryNotes: { type: String, trim: true, default: "", maxlength: 300 },
    },

    // Invariant (enforced below):
    // totalRetailPaid = totalWholesaleToShop + totalCommissionSplit + platformFee
    financials: {
      totalRetailPaid: int({ required: true }),       // everything the buyer paid = escrow amount
      totalWholesaleToShop: int({ required: true }),  // seller's net
      totalCommissionSplit: int({ required: true, default: 0 }), // promoter's 5%
      platformFee: int({ required: true, default: 0 }),          // Sokodigi's 1%
      deliveryFeePaid: int({ default: 0 }),           // informational: included in retail, paid to seller
    },

    orderStatus: {
      type: String,
      enum: ["PENDING_PAYMENT", "PROCESSING", "DISPATCHED", "DELIVERED", "CANCELLED"],
      default: "PENDING_PAYMENT",
      index: true,
    },
    // Set to true ONLY inside the same transaction that releases escrow.
    // EscrowAccount.status is the source of truth.
    isEscrowReleased: { type: Boolean, default: false },
    deliveredAt: Date,
    dispatchedAt: Date,
    cancelledAt: Date,
  },
  { timestamps: true }
);

orderSchema.pre("validate", function (next) {
  const f = this.financials;
  if (f && f.totalRetailPaid !== f.totalWholesaleToShop + f.totalCommissionSplit + f.platformFee) {
    return next(new Error("FINANCIAL_SPLIT_MISMATCH"));
  }
  next();
});

orderSchema.index({ sellerId: 1, deliveredAt: 1 });
orderSchema.index({ buyerId: 1, deliveredAt: 1 });
orderSchema.index({ sellerId: 1, orderStatus: 1 });
orderSchema.index({ buyerId: 1, createdAt: -1 });
orderSchema.index({ promoterId: 1, createdAt: -1 });

module.exports = mongoose.models.Order || mongoose.model("Order", orderSchema);
