const ProductCost = require("../../models/ProductCost");
const { entitlementsFor, requireFeature } = require("../membership/entitlements"); // extend the existing import

router.get("/costs", authenticate, member, perUser(30), async (req, res) => {
  try {
    const rows = await ProductCost.find({ sellerId: req.user._id }).select("productId costPrice").lean();
    res.json({ ok: true, costs: Object.fromEntries(rows.map((r) => [String(r.productId), r.costPrice])) });
  } catch (e) { fail(res, e, "inventory costs"); }
});

// body: { costPrice: whole number | null }. Private: never returned by any public route.
router.put("/products/:id/cost", authenticate, member, requireFeature("pos"), perUser(60), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "INVALID_ID" });
    const c = req.body?.costPrice;
    if (c !== null && !(Number.isInteger(c) && c >= 0 && c <= 5000000)) return res.status(400).json({ error: "INVALID_COST" });
    if (!(await Product.exists({ _id: id, sellerId: req.user._id }))) return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    if (c === null) await ProductCost.deleteOne({ productId: id, sellerId: req.user._id });
    else await ProductCost.updateOne({ productId: id }, { $set: { costPrice: c }, $setOnInsert: { sellerId: req.user._id } }, { upsert: true });
    res.json({ ok: true });
  } catch (e) { fail(res, e, "set cost"); }
});
