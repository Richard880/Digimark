const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  ledgerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    default: () => new mongoose.Types.ObjectId(),
    index: true 
  },
  orderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true, 
    index: true 
  },
  type: { 
    type: String, 
    enum: ['MPESA_INFLOW', 'ESCROW_LOCK', 'VENDOR_DISBURSEMENT', 'PLATFORM_REVENUE', 'REFUND'], 
    required: true 
  },
  debitAccountId: { 
    type: mongoose.Schema.Types.ObjectId, 
    description: 'Account giving up value (User ID or Platform Engine system ID)' 
  },
  creditAccountId: { 
    type: mongoose.Schema.Types.ObjectId, 
    description: 'Account receiving value (User ID or Platform Engine system ID)' 
  },
  amount: { 
    type: Number, 
    required: true, 
    min: [0.01, 'Transaction amount must be greater than zero'] 
  },
  currency: { 
    type: String, 
    required: true, 
    default: 'KES' 
  },
  reference: { 
    type: String, 
    required: true,
    description: 'System metadata links, e.g., M-Pesa Receipt or internal token'
  }
}, { timestamps: true, immutable: true });

module.exports = mongoose.model('Transaction', transactionSchema);
