const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema({
  recipientId: { type: String, required: true, index: true },
  senderId: { type: String },
  type: { 
    type: String, 
    enum: ["NEW_MESSAGE", "MPESA_PUSH_SENT", "ESCROW_LOCKED", "PAYMENT_RELEASED", "TEAM_INVITE"], 
    required: true 
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  actionUrl: { type: String }, // Maps users directly to pages like /messages or /wallet
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Notification", NotificationSchema);
