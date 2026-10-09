const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    productCode: { type: String, required: true, unique: true, index: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // 🎯 NEW FALLBACK KEY: Linked directly to our updated backend aggregation pipelines
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, 
    
    name: { type: String, required: true, trim: true, index: true },
    brandName: { type: String, trim: true, default: "" },
    
    // =========================================================================
    // 🏷️ LOCKED HIERARCHICAL TAXONOMY STRUCTURE
    // =========================================================================
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
        "general"
      ],
      default: "general",
      index: true 
    },
    subCategory: {
      type: String,
      trim: true,
      lowercase: true,
      default: "general"
    },
    
    // =========================================================================
    // 💰 REINFORCED PRICE & MULTI-LEVEL SPLIT COMMISSION MATRIX
    // =========================================================================
    price: { type: Number, required: true, min: 0 }, 
    
    wholesalePrice: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    // 🎯 NEW FALLBACK KEY: Maps seamlessly to our MarketHub data redaction guard layers
    resellerWholesaleCost: {
      type: Number,
      default: 0,
      min: 0
    },
    
    affiliateCommission: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: {
        validator: function (value) {
          const availableMargin = this.price - this.wholesalePrice;
          return value <= availableMargin;
        },
        message: "COMMISSION_MARGIN_OVERFLOW: Commission offered cannot exceed total shop profit margins."
      }
    },

    // =========================================================================
    // 📦 INVENTORY & METRICS CONTROLS
    // =========================================================================
    // =========================================================================
    // 📦 INVENTORY & METRICS CONTROLS
    // =========================================================================
    quantity: { type: Number, default: 0, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    description: { type: String, trim: true, default: "" },
    imageUrl: { type: String, default: "" },
    
    // 🎯 FIXED OVERFLOW: Expanded enum configurations to support your UI status toggles
    status: { 
      type: String, 
      enum: ["DRAFT", "READY", "LISTED", "ACTIVE", "UNLISTED", "ARCHIVED"], 
      default: "ACTIVE", // Swapped default to matching ACTIVE state 
      index: true 
    },
    // 🎯 VISIBILITY FLAGS: Synchronizes with the dashboard toggle-shelf buttons
    isShelved: { type: Boolean, default: true, index: true },
    isPremiumVendor: { type: Boolean, default: false },
    likesCount: { type: Number, default: 0, min: 0 },

    // =========================================================================
    // 🧠 BEHAVIORAL INTENT-DRIVEN SMART METRICS (For Algorithmic Sorting)
    // =========================================================================
    metrics: {
      conversionRate: { type: Number, default: 0, min: 0, max: 1 },
      referralCount: { type: Number, default: 0, min: 0 },
      escrowDisputeRate: { type: Number, default: 0, min: 0, max: 1 }
    }
  },
  { timestamps: true }
);

// High-speed performance compound indexing strategies
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ sellerId: 1, createdAt: -1 });
productSchema.index({ category: 1, price: 1 });
// 🎯 NEW ALGORITHMIC INDEX: Optimizes MarketHub ranking queries
productSchema.index({ isShelved: 1, category: 1, "metrics.conversionRate": -1 });

// Atomic calculation pre-save helper
productSchema.pre("save", async function () {
  if (this.wholesalePrice === 0 && this.price > 0) {
    this.wholesalePrice = this.price - this.affiliateCommission;
  }
  
  this.resellerWholesaleCost = this.wholesalePrice;
  if (!this.merchantId) this.merchantId = this.sellerId;
});


module.exports = mongoose.model("Product", productSchema);
