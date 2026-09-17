const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    trim: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  phone: { 
    type: String, 
    required: true, 
    trim: true 
  },
  gender: { 
    type: String, 
    required: true, 
    enum: ['male', 'female'] 
  },
  profilePic: { 
    type: String, 
    default: 'default-avatar.png' 
  },
  nationalId: { 
    type: String, 
    default: null 
  },
  
  // 🌲 MLM CORE STRUCTURAL FORCED-MATRIX POINTERS
  sponsorId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null 
  },
  parentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null 
  },
  referrals: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  
  active: { 
    type: Boolean, 
    default: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });

// ⚡ High-speed optimization indexes for high volume trees
// userSchema.index({ email: 1 });
// ⚡ High-speed optimization indexes for forced-matrix operations
// (Note: The email index is handled automatically by the unique: true property above!)
userSchema.index({ parentId: 1 });
userSchema.index({ sponsorId: 1 });

// 🎯 THE FIX: Check if the model has already been compiled in the Mongoose memory cache first
module.exports = mongoose.models.User || mongoose.model("User", userSchema);


