const mongoose = require("mongoose");
const { Schema } = mongoose;

const whole = {
  validator: Number.isInteger,
  message: "{PATH} must be a whole number",
};

const stockMovementSchema = new Schema(
  {
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
      index: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      immutable: true,
      index: true,
    },
    branchId: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      default: null, // null = default / primary branch for now
      index: true,
    },

    // Positive = stock in, Negative = stock out
    quantity: {
      type: Number,
      required: true,
      validate: whole,
    },

    type: {
      type: String,
      required: true,
      enum: [
        "sale",           // POS / manual sale / online order
        "purchase",       // restock / supplier delivery
        "adjustment",     // manual correction
        "return",         // customer return
        "damage",         // damaged / lost / expired
        "transfer_in",
        "transfer_out",
        "void_sale",      // when a manual sale is voided
      ],
    },

    // Optional human-readable reason
    reason: { type: String, default: "", maxlength: 120 },
    note: { type: String, default: "", maxlength: 300 },

    // Link back to the source document
    referenceType: {
      type: String,
      enum: ["manual_sale", "order", "purchase_order", "transfer", "manual", null],
      default: null,
    },
    referenceId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    // Who performed the action
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    // Snapshot of stock after this movement (very useful for audits)
    balanceAfter: {
      type: Number,
      required: true,
      validate: whole,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Common query patterns
stockMovementSchema.index({ productId: 1, createdAt: -1 });
stockMovementSchema.index({ sellerId: 1, createdAt: -1 });
stockMovementSchema.index({ sellerId: 1, productId: 1, createdAt: -1 });

module.exports =
  mongoose.models.StockMovement ||
  mongoose.model("StockMovement", stockMovementSchema);
