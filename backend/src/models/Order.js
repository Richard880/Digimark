const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true,
      default: () => `SDO-${Math.random().toString(36).substr(2, 7).toUpperCase()}`
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    // The optional marketer who drove the sale via their in-app shared showcase store link
    promoterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true
        },
        name: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        pricePaid: { type: Number, required: true }, // Snapshots the customer retail price at checkout time
        commissionAllocated: { type: Number, default: 0 } // Snapshots affiliate commission split tier
      }
    ],
    // =========================================================================
    // 🚚 SHIPPING & LOGISTICS INFRASTRUCTURE LINES
    // =========================================================================
    shippingDetails: {
      fullName: { type: String, required: true, trim: true },
      phoneNumber: { type: String, required: true, trim: true },
      county: { type: String, required: true, trim: true }, // e.g., Kisumu, Nairobi, Mombasa
      subCounty: { type: String, required: true, trim: true },
      deliveryNotes: { type: String, trim: true, default: "" } // Pick-up station details or physical addresses
    },

    // 🎯 ADD THIS BLOCK TO YOUR ORDER.JS SCHEMA PROPERTIES:
orderNumber: {
  type: String,
  required: true,
  unique: true,
  uppercase: true,
  index: true,
  default: () => `SDO-${Math.random().toString(36).substr(2, 7).toUpperCase()}`
},

// 🎯 NEW: 6-Digit Alpha-Numeric or Numeric Secure Unlock Pin for Desktop Fallbacks
escrowReleasePin: {
  type: String,
  required: true,
  index: true,
  // Auto-generates a crisp, unguessable 6-digit uppercase code string
  default: () => Math.floor(100000 + Math.random() * 900000).toString()
},

    // =========================================================================
    // 💰 FINANCIAL MATRIX METRICS
    // =========================================================================
    financials: {
      totalRetailPaid: { type: Number, required: true, min: 0 },
      totalCommissionSplit: { type: Number, required: true, default: 0 },
      totalWholesaleToShop: { type: Number, required: true, min: 0 },
      deliveryFeePaid: { type: Number, required: true, default: 0 }
    },
    orderStatus: {
      type: String,
      enum: ["PENDING_PAYMENT", "PROCESSING", "DISPATCHED", "DELIVERED", "CANCELLED"],
      default: "PROCESSING",
      index: true
    },
    isEscrowReleased: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  { timestamps: true }
);

// High-speed compound performance optimization index layers
orderSchema.index({ sellerId: 1, orderStatus: 1 });
orderSchema.index({ buyerId: 1, createdAt: -1 });

module.exports = mongoose.models.Order || mongoose.model("Order", orderSchema);
