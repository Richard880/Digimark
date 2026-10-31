const Product = require("../models/Product");
const StockMovement = require("../models/StockMovement");
const { getOrCreatePrimaryBranch } = require("./branchService");


const record = (
  session,
  { product, delta, type, ref, note, actorId, branchId }
) =>
  StockMovement.create(
    [
      {
        sellerId: product.sellerId,
        productId: product._id,
        productName: product.name,
        type,
        delta,
        balanceAfter: product.quantity,
        ref,
        note: note || "",
        actorId: actorId || null,
        branchId: branchId || undefined,
      },
    ],
    { session }
  );

async function changeStock(
  session,
  {
    productId,
    sellerId,
    delta,
    type,
    ref,
    note,
    actorId,
    max,
    branchId = null,
  }
) {
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

  // Use the primary branch when no branch was provided.
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
