const Product = require("../models/Product");
const StockMovement = require("../models/StockMovement");

const record = (session, { product, delta, type, ref, note, actorId }) =>
  StockMovement.create(
    [{ sellerId: product.sellerId, productId: product._id, productName: product.name, type, delta, balanceAfter: product.quantity, ref, note: note || "", actorId: actorId || null }],
    { session }
  );

// Atomic change plus ledger line, in the caller's transaction. Returns null if the product is missing
// or the change would take stock below zero (or above `max`).
async function changeStock(session, { productId, sellerId, delta, type, ref, note, actorId, max }) {
  const filter = { _id: productId };
  if (sellerId) filter.sellerId = sellerId;
  if (delta < 0) filter.quantity = { $gte: -delta };
  if (delta > 0 && max) filter.quantity = { $lte: max - delta };
  const product = await Product.findOneAndUpdate(filter, { $inc: { quantity: delta } }, { new: true, session });
  if (!product) return null;
  await record(session, { product, delta, type, ref, note, actorId });
  return product;
}

module.exports = { record, changeStock };
