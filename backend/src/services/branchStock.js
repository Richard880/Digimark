const Product = require("../models/Product");
const BranchStock = require("../models/BranchStock");
const StockMovement = require("../models/StockMovement");
const { changeStock } = require("./stockLedger");

// Create zero rows BEFORE opening a transaction: a duplicate-key error inside one would abort it
async function ensureRows(ownerId, branchId, productIds) {
  if (!productIds.length) return;
  try {
    await BranchStock.bulkWrite(productIds.map((productId) => ({
      updateOne: { filter: { productId, branchId }, update: { $setOnInsert: { ownerId, quantity: 0 } }, upsert: true },
    })), { ordered: false });
  } catch (e) { if (e.code !== 11000) throw e; }
}

async function currentQty(session, ownerId, branch, productId) {
  if (branch.isMain) return (await Product.findOne({ _id: productId, sellerId: ownerId }).select("quantity").session(session).lean())?.quantity || 0;
  return (await BranchStock.findOne({ productId, branchId: branch._id }).select("quantity").session(session).lean())?.quantity || 0;
}

// Atomic change plus ledger line. Returns null if the product is missing or the change would go below zero (or above max).
async function changeBranchStock(session, { ownerId, productId, branch, delta, type, ref, note, actorId, max }) {
  if (branch.isMain) return changeStock(session, { productId, sellerId: ownerId, delta, type, ref, note, actorId, max, branchId: branch._id });
  const prod = await Product.findOne({ _id: productId, sellerId: ownerId }).select("name").session(session).lean();
  if (!prod) return null;
  const filter = { productId, branchId: branch._id };
  if (delta < 0) filter.quantity = { $gte: -delta };
  else if (max) filter.quantity = { $lte: max - delta };
  const row = await BranchStock.findOneAndUpdate(filter, { $inc: { quantity: delta } }, { new: true, session });
  if (!row) return null;
  await StockMovement.create([{ sellerId: ownerId, productId, productName: prod.name, type, delta, balanceAfter: row.quantity, ref, note: note || "", actorId: actorId || null, branchId: branch._id }], { session });
  return row;
}

module.exports = { ensureRows, currentQty, changeBranchStock };
