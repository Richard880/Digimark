const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  courierId: { type: mongoose.Schema.Types.ObjectId, required: true },
  note: { type: String, default: "", maxlength: 120 },
}, { timestamps: true });
schema.index({ courierId: 1 });
module.exports = mongoose.models.CourierAssignment || mongoose.model("CourierAssignment", schema);
