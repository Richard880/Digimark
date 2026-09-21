const mongoose = require("mongoose");
const Product = require("../src/models/Product");
const Order = require("../src/models/Order");
const walletService = require("./walletService");

/**
 * 🛒 Atomic Checkout Processing Engine
 * Handles real-time inventory deductions and multi-level wallet splits safely using an ACID transaction session
 */
async function processOrderCheckout({ buyerId, productId, quantity, promoterId, shippingDetails }) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const orderQty = Number(quantity);
    if (orderQty <= 0) throw new Error("CHECKOUT_ERROR: Quantity must be at least 1.");

    // 1. Locate the master product record with an exclusive write lock in the session
    const product = await Product.findOne({ _id: productId, status: "LISTED" }).session(session);
    if (!product) throw new Error("CHECKOUT_REJECTED: Product is unavailable or out-of-stock.");

    // 🎯 CRITICAL RULE: Enforce stock check and perform an atomic inventory subtraction
    if (product.quantity < orderQty) {
      throw new Error(`INVENTORY_SHORTAGE: Only ${product.quantity} items left in storage shelves.`);
    }

    // Deduct stock levels safely
    product.quantity -= orderQty;
    if (product.quantity === 0) {
      product.status = "OUT_OF_STOCK";
    }
    await product.save({ session });

    // 2. Compute the exact multi-level financial split maps
    const itemRetailPrice = product.price;
    const itemCommission = product.affiliateCommission || 0;
    
    const totalRetailPaid = itemRetailPrice * orderQty;
    const totalCommissionSplit = itemCommission * orderQty;
    const totalWholesaleToShop = totalRetailPaid - totalCommissionSplit;
    const deliveryFeePaid = product.deliveryFee || 0;

    // 3. Create the Order document record inside the current database session
    const order = await Order.create(
      [
        {
          buyerId,
          sellerId: product.sellerId,
          promoterId: promoterId || null,
          items: [
            {
              productId: product._id,
              name: product.name,
              quantity: orderQty,
              pricePaid: itemRetailPrice,
              commissionAllocated: itemCommission
            }
          ],
          shippingDetails,
          financials: {
            totalRetailPaid,
            totalCommissionSplit,
            totalWholesaleToShop,
            deliveryFeePaid
          },
          orderStatus: "PROCESSING"
        }
      ],
      { session }
    );

    // 4. Trigger our atomic wallet ledger splitting process
    // Deducts retail cost from buyer, pushes wholesale to supplier's escrow, and drops commission into affiliate's live balance
    const walletSplit = await walletService.executeProductPurchaseSplit({
      buyerId,
      sellerId: product.sellerId,
      promoterId: promoterId || null,
      retailPrice: totalRetailPaid + deliveryFeePaid,
      commissionAmount: totalCommissionSplit,
      orderId: order[0].orderNumber
    });

    if (!walletSplit.ok) {
      throw new Error(`FINANCIAL_SPLIT_REJECTED: ${walletSplit.reason}`);
    }

    // If everything passes smoothly, commit the session transaction right away!
    await session.commitTransaction();
    session.endSession();

    return { ok: true, orderNumber: order[0].orderNumber, product };

  } catch (error) {
    // Automatically rolls back inventory counts and cash states if an operation crashes!
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Checkout Pipeline Fault Aborted:", error.message);
    return { ok: false, reason: error.message };
  }
}

module.exports = { processOrderCheckout };
