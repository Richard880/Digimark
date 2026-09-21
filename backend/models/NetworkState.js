const mongoose = require("mongoose");

const networkStateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    // 🎯 CRITICAL RULE 1: Count of personally sponsored users who are CURRENTLY active.
    // If this count is less than 2 or 3, we can programmatically lock higher tier payouts!
    personalActiveCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Aggregated structure totals cached for fast processing
    cachedGenerationCounts: {
      level_1: { type: Number, default: 0, min: 0, max: 10 },
      level_2: { type: Number, default: 0, min: 0, max: 100 },
      level_3: { type: Number, default: 0, min: 0, max: 1000 },
      level_4: { type: Number, default: 0, min: 0, max: 10000 },
    },
    // Real-time counter of spillover nodes received from upstream ancestors
    totalSpilloversReceived: {
      type: Number,
      default: 0,
    },
    // Lock parameter to freeze balances if fraudulent multi-accounting pattern matching triggers
    isMatrixLocked: {
      type: Boolean,
      default: false,
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("NetworkState", networkStateSchema);
