const mongoose = require("mongoose");

const ChatMessageSchema = new mongoose.Schema(
  {
    senderId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true, 
      index: true 
    },
    recipientId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true, 
      index: true 
    },
    encryptedBlob: { 
      type: String, 
      required: true 
    },
    iv: { 
      type: Array, 
      required: true 
    },
    isRead: { 
      type: Boolean, 
      default: false, 
      index: true 
    }
  },
  { timestamps: true }
);

// High-speed compound indexing for immediate chronological messaging stream loading
ChatMessageSchema.index({ senderId: 1, recipientId: 1, createdAt: 1 });

module.exports = mongoose.model("ChatMessage", ChatMessageSchema);
