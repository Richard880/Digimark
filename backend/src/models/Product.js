const mongoose = require("mongoose");

// Money and stock are whole numbers. The controller enforces this too; this is the safety net.
const whole = { validator: Number.isInteger, message: "{PATH} must be a whole number" };

const productSchema = new mongoose.Schema(
  {
    productCode: { type: String, required: true, unique: true, immutable: true },

    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    // Legacy alias of sellerId (the order controller reads either)
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", immutable: true },

    name: { type: String, required: true, trim: true, maxlength: 120 },
    brandName: { type: String, trim: true, default: "", maxlength: 60 },

    category: {
      type: String,
      trim: true,
      lowercase: true,
      enum: [
        "phones-gadgets",
        "tech-computing",
        "apparel-fashion",
        "home-appliances",
        "beauty-personal-care",
        "ankara-art",
        "general",
      ],
      default: "general",
    },
    subCategory: { type: String, trim: true, lowercase: true, default: "general", maxlength: 40 },

    // Retail price in whole shillings
    price: { type: Number, required: true, min: 1, validate: whole },

    // Server-computed from price (config/fees.js). Never trust client values.
    // wholesalePrice = price - affiliateCommission - platform fee = seller's net.
    wholesalePrice: { type: Number, required: true, default: 0, min: 0, validate: whole },
    resellerWholesaleCost: { type: Number, default: 0, min: 0, validate: whole },
    affiliateCommission: { type: Number, required: true, default: 0, min: 0, validate: whole },

    // NOTE: min only runs on save(). Stock safety comes from the atomic $gte filter in createOrder.
    quantity: { type: Number, default: 0, min: 0, validate: whole },
    deliveryFee: { type: Number, default: 0, min: 0, validate: whole },
    description: { type: String, trim: true, default: "", maxlength: 2000 },
    imageUrl: { type: String, default: "", maxlength: 500 },

    // 💡 costPrice has been removed from here to protect margin data from public aggregations.

    // ACTIVE is legacy and treated as LISTED. DRAFT/READY/ARCHIVED are never public.
    status: {
      type: String,
      enum: ["DRAFT", "READY", "LISTED", "ACTIVE", "UNLISTED", "ARCHIVED"],
      default: "LISTED",
    },
    isShelved: { type: Boolean, default: true },
    hiddenByExpiry: { type: Boolean, default: false },
    hiddenByAdmin: { type: Boolean, default: false },
    isPremiumVendor: { type: Boolean, default: false },
    likesCount: { type: Number, default: 0, min: 0 },

    // Written by the system only (never from request bodies)
    metrics: {
      conversionRate: { type: Number, default: 0, min: 0, max: 1 },
      referralCount: { type: Number, default: 0, min: 0 },
      escrowDisputeRate: { type: Number, default: 0, min: 0, max: 1 },
    },
  },
  { timestamps: true }
);

// Indexes: only the ones real queries use
productSchema.index({ isShelved: 1, status: 1, quantity: 1 });            // public feed
productSchema.index({ sellerId: 1, status: 1, createdAt: -1 });           // seller inventory
productSchema.index({ category: 1, price: 1 });                           // category browsing
productSchema.index({ isShelved: 1, category: 1, "metrics.conversionRate": -1 }); // ranking

// Keep the legacy alias columns in sync (does NOT touch prices)
productSchema.pre("save", function () {
  this.resellerWholesaleCost = this.wholesalePrice;
  if (!this.merchantId) this.merchantId = this.sellerId;
});

module.exports = mongoose.models.Product || mongoose.model("Product", productSchema);
