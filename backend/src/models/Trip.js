const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  orderNumber: String, ownerId: mongoose.Schema.Types.ObjectId, buyerId: mongoose.Schema.Types.ObjectId, courierUserId: mongoose.Schema.Types.ObjectId,
  courierName: String, vehicleType: String, active: { type: Boolean, default: true },
  lat: Number, lng: Number, accuracy: Number, pingedAt: Date, startedAt: Date,
  expireAt: { type: Date, expires: 0 }, // the database deletes it automatically
});
schema.index({ buyerId: 1, active: 1 });
module.exports = mongoose.models.Trip || mongoose.model("Trip", schema);
