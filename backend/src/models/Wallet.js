const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    // 🎯 ATOMIC LEDGER BALANCE: Always increment/decrement this using MongoDB's \$inc operator
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "WALLET_OVERDRAFT_VIOLATION: Wallet balance cannot drop below zero."],
    },
    // Funds temporarily locked until a customer or delivery hook confirms successful receipt
    escrowBalance: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    // Immutable accounting journal history logging all incoming and outgoing cash flows
    transactions: [
      {
        transactionId: {
          type: String,
          required: true,
          default: () => `TXN-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        },
        amount: {
          type: Number,
          required: true,
        },
        // deposit (M-Pesa/Card), receive_transfer, affiliate_commission, network_commission, product_purchase, send_transfer, matrix_subscription, withdrawal
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
            "withdrawal"
          ],
        },
        status: {
          type: String,
          enum: ["PENDING", "COMPLETED", "FAILED", "ESCROW_HELD"],
          default: "COMPLETED",
        },
        referenceId: {
          type: String, // Tracks internal Order ID, Subscription ID, or External M-PESA Receipt Code
          default: null,
        },
        description: {
          type: String,
          trim: true,
          default: "",
        },
        createdAt: {
          type: Date,
          default: Date.now,
        }
      }
    ],
    // Safety parameter to freeze operations if a bug or suspect pattern triggers
    isFrozen: {
      type: Boolean,
      default: false,
    }
  },
  { timestamps: true }
);

// High-speed index tracking for financial performance optimization
walletSchema.index({ userId: 1, "transactions.transactionId": 1 });
walletSchema.index({ "transactions.referenceId": 1 });

module.exports = mongoose.models.Wallet || mongoose.model("Wallet", walletSchema);
