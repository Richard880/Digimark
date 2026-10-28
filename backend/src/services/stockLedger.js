const Product = require("../models/Product");
const StockMovement = require("../models/StockMovement");
const { getOrCreatePrimaryBranch } = require("./branchService");

const record = (session, { product, delta, type, ref, note, actorId, branchId }) =>
  StockMovement.create(
    [{
      sellerId: product.sellerId,
      productId: product._id,
      productName: product.name,
      branchId: branchId || null,
      type,
      delta,
      balanceAfter: product.quantity,
      ref,
      note: note || "",
      actorId: actorId || null,
    }],
    { session }
  );

/**
 * Atomic stock change + ledger entry.
 * Automatically uses the primary branch if none is provided.
 */
async function changeStock(session, {
  productId,
  sellerId,
  delta,
  type,
  ref,
  note,
  actorId,
  max,
  branchId = null,
}) {
  const filter = { _id: productId };
  if (sellerId) filter.sellerId = sellerId;
  if (delta < 0) filter.quantity = { $gte: -delta };
  if (delta > 0 && max) filter.quantity = { $lte: max - delta };

  const product = await Product.findOneAndUpdate(
    filter,
    { $inc: { quantity: delta } },
    { new: true, session }
  );

  if (!product) return null;

  // Resolve branch (use provided or fall back to primary)
  let finalBranchId = branchId;
  if (!finalBranchId) {
    const primary = await getOrCreatePrimaryBranch(product.sellerId, session);
    finalBranchId = primary._id;
  }

  await record(session, {
    product,
    delta,
    type,
    ref,
    note,
    actorId,
    branchId: finalBranchId,
  });

  return product;
}

module.exports = { record, changeStock };
