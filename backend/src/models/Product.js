const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    productCode: { type: String, required: true, unique: true, index: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    brandName: { type: String, trim: true, default: "" },
    category: { type: String, trim: true, default: "", index: true },
    
    // =========================================================================
    // 💰 REINFORCED PRICE & MULTI-LEVEL SPLIT COMMISSION MATRIX
    // =========================================================================
    price: { type: Number, required: true, min: 0 }, // The retail price paid by the final buyer
    
    // 🎯 NEW: The base wholesale cost the Supplier expects to keep after a sale
    wholesalePrice: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    
    // 🎯 NEW: The direct commission cut allocated straight to the promoting network member
    affiliateCommission: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: {
        validator: function (value) {
          // Commission cannot exceed the markup gap between retail and wholesale costs
          // If a shop lists an item for 1,000 and expects 800 wholesale, commission maxes at 200
          const availableMargin = this.price - this.wholesalePrice;
          return value <= availableMargin;
        },
        message: "COMMISSION_MARGIN_OVERFLOW: Commission offered cannot exceed total shop profit margins."
      }
    },

    // =========================================================================
    // 📦 INVENTORY & METRICS CONTROLS
    // =========================================================================
    quantity: { type: Number, default: 0, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    description: { type: String, trim: true, default: "" },
    imageUrl: { type: String, default: "" },
    status: { type: String, enum: ["DRAFT", "READY", "LISTED", "ARCHIVED"], default: "READY", index: true },
    likesCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// High-speed performance compound indexing strategies
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ sellerId: 1, createdAt: -1 });
productSchema.index({ category: 1, price: 1 });

// Atomic calculation pre-save helper
productSchema.pre("save", function (next) {
  // If wholesalePrice wasn't supplied, default it safely to 80% of retail price
  if (this.wholesalePrice === 0 && this.price > 0) {
    this.wholesalePrice = this.price - this.affiliateCommission;
  }
  
});

module.exports = mongoose.model("Product", productSchema);
