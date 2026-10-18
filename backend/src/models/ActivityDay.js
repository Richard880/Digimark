const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  day: { type: String, required: true }, // "YYYY-MM-DD" (Nairobi)
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 120 },
});
schema.index({ userId: 1, day: 1 }, { unique: true });

module.exports = mongoose.models.ActivityDay || mongoose.model("ActivityDay", schema);
