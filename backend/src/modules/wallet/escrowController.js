const mongoose = require('mongoose');
const Wallet = require('../../models/Wallet');
const EscrowAccount = require('../../models/EscrowAccount');

/**
 * 1. Lock Incoming M-PESA Transaction into Escrow
 * Secures order payment maps and increments the vendor's escrowBalance while appending a receipt record.
 */
async function lockMpesaPaymentToEscrow({ orderId, buyerId, vendorId, totalAmount, mpesaReceipt, commissionRate }) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const platformCommissionAmount = Number((totalAmount * (commissionRate / 100)).toFixed(2));
    const vendorSplitAmount = Number((totalAmount - platformCommissionAmount).toFixed(2));

    // 1. Create the persistent tracking engine layout
    const [escrow] = await EscrowAccount.create([{
      orderId,
      buyerId,
      vendorId,
      mpesaReceiptNumber: mpesaReceipt,
      totalAmountHeld: totalAmount,
      vendorSplitAmount,
      platformCommissionAmount,
      commissionPercentage: commissionRate,
      status: 'SECURED'
    }], { session });

    // 2. Safely increment vendor's escrow ledger block and inject history log
    const updatedVendorWallet = await Wallet.findOneAndUpdate(
      { userId: vendorId, isFrozen: false },
      { 
        $inc: { escrowBalance: vendorSplitAmount },$push: {
          transactions: {
            amount: vendorSplitAmount,
            type: 'deposit', // M-Pesa dynamic inflow event mapping
            status: 'ESCROW_HELD',
            referenceId: String(orderId),
            description: `Escrow payment secured via M-Pesa (${mpesaReceipt}). Awaiting client delivery execution confirmation.`
          }
        }
      },
      { new: true, upsert: true, session, runValidators: true }
    );

    if (!updatedVendorWallet) {
      throw new Error('Targeted vendor wallet operations are frozen or unavailable.');
    }

    await session.commitTransaction();
    return { success: true, escrowId: escrow._id };
  } catch (error) {
    await session.abortTransaction();
    throw new Error(`Escrow initialization state failure: ${error.message}`);
  } finally {
    session.endSession();
  }
}

/**
 * 2. Secure Escrow Release Trigger on Order Fulfillment
 * Liquidates vendor escrow assets straight into real available withdrawable currency.
 */
async function releaseEscrowToVendor(orderId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Retrieve current open order escrow allocation mappings
    const escrow = await EscrowAccount.findOne({ orderId }).session(session);
    if (!escrow) throw new Error('Targeted escrow context mapping records not found');
    if (escrow.status !== 'SECURED') throw new Error(`Invalid lifecycle state transaction path: ${escrow.status}`);

    // 2. Deduct from escrowBalance and systematically route into available withdrawable balance
    const vendorWalletUpdate = await Wallet.findOneAndUpdate(
      { 
        userId: escrow.vendorId, 
        isFrozen: false,
        escrowBalance: { $gte: escrow.vendorSplitAmount } 
      },
      { 
        $inc: { 
          escrowBalance: -escrow.vendorSplitAmount, 
          balance: escrow.vendorSplitAmount // Atomic update using \$inc operator
        },
        $push: {
          transactions: {
            amount: escrow.vendorSplitAmount,
            type: 'receive_transfer',
            status: 'COMPLETED',
            referenceId: String(orderId),
            description: `Escrow released successfully for Order #${orderId}. Net vendor split earnings unlocked.`
          }
        }
      },
      { new: true, session, runValidators: true }
    );

    if (!vendorWalletUpdate) {
      throw new Error('Vendor wallet balancing safety invariant violated: insufficient escrow matching limits or account frozen');
    }

    // 3. Mark the state tracking document completely closed
    escrow.status = 'DISBURSED';
    await escrow.save({ session });

    await session.commitTransaction();
    return { success: true, releasedAmount: escrow.vendorSplitAmount };
  } catch (error) {
    await session.abortTransaction();
    throw new Error(`Escrow liquidation state failure: ${error.message}`);
  } finally {
    session.endSession();
  }
}

module.exports = {
  lockMpesaPaymentToEscrow,
  releaseEscrowToVendor
};
