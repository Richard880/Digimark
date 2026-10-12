const mongoose = require('mongoose');

const escrowAccountSchema = new mongoose.Schema({
  orderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true, 
    unique: true, 
    index: true 
  },
  buyerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true 
  },
  vendorId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true,
    index: true
  },
  mpesaReceiptNumber: { 
    type: String, 
    required: true, 
    unique: true 
  },
  totalAmountHeld: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  vendorSplitAmount: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  platformCommissionAmount: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  commissionPercentage: { 
    type: Number, 
    required: true, 
    min: 0, 
    max: 100 
  },
  status: { 
    type: String, 
    enum: ['PENDING', 'SECURED', 'DISBURSED', 'DISPUTED', 'REFUNDED'], 
    default: 'PENDING',
    required: true 
  }
}, { timestamps: true });

module.exports = mongoose.model('EscrowAccount', escrowAccountSchema);
