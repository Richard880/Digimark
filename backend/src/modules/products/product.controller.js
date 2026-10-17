const crypto = require("crypto");
const mongoose = require("mongoose");
const Product = require("../../models/Product");
const Order = require("../../models/Order");
const ShareLink = require("../../models/ShareLink");
const { PLATFORM_BP, AFFILIATE_BP } = require("../config/fees");
const CATEGORIES = Product.schema.path("category").enumValues;

// =========================================================================
// CONFIG & HELPERS
// =========================================================================
const VALID_PRODUCT_STATUSES = ["LISTED", "UNLISTED", "ACTIVE"];
const VISIBLE = { status: { $in: ["LISTED", "ACTIVE"] }, isShelved: true }; // ACTIVE = legacy
const OPEN_ORDER_STATES = ["PENDING_PAYMENT", "PROCESSING", "DISPATCHED"];
const ALWAYS_PRIVATE = ["wholesalePrice", "resellerWholesaleCost", "internalNotes", "metrics", "merchantId"];

const MIN_PRICE = 50;
const MAX_PRICE = 10_000_000;
const MAX_DELIVERY = 100_000;
const MAX_QTY = 100_000;

const generateProductCode = () => `SKD-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
const isValidId = (id) => typeof id === "string" && mongoose.isValidObjectId(id);
const normalizeStatus = (s) => (s === "ACTIVE" ? "LISTED" : s);
const getUserCategory = (req) => req.userCategory || "guest";
const isNetworkUser = (req) => getUserCategory(req) === "network";
const isProductOwner = (p, user) => !!(p && user?._id && String(p.sellerId) === String(user._id));

// Whole numbers only. Accepts 500 or "500", rejects 99.99, "1e9", NaN.
const toInt = (v) =>
  typeof v === "number" ? v : typeof v === "string" && /^\d{1,12}$/.test(v.trim()) ? Number(v) : NaN;
const str = (v, max) => (typeof v === "string" && v.trim().length <= max ? v.trim() : null);
function cleanUrl(v) {
  if (v === "") return "";
  try {
    const u = new URL(v);
    return u.protocol === "https:" && v.length <= 500 ? u.toString() : null;
  } catch {
    return null;
  }
}

function paging(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

// Fees are computed on the server only (single source: config/fees.js)
function feeFields(price) {
  const affiliate = Math.round((price * AFFILIATE_BP) / 10000);
  const platform = Math.round((price * PLATFORM_BP) / 10000);
  const net = price - affiliate - platform;
  return { affiliateCommission: affiliate, wholesalePrice: net, resellerWholesaleCost: net };
}

const bad = (res, error, status = 400) => res.status(status).json({ ok: false, error });

function sendServerError(res, error, context) {
  console.error(`❌ ${context}:`, error.stack || error.message);
  return res.status(500).json({ ok: false, error: "INTERNAL_SERVER_ERROR", message: "An unexpected server error occurred." });
}

// Returns true if the caller may manage products; otherwise has already replied
function requireSeller(req, res) {
  if (!req.user?._id) { bad(res, "AUTHENTICATION_REQUIRED", 401); return false; }
  if (!isNetworkUser(req)) { bad(res, "MARKETER_ACCOUNT_REQUIRED", 403); return false; }
  return true;
}

// Owner sees everything. Marketers see the commission only. Everyone else sees neither.
function shape(product, req) {
  if (!product) return product;
  const out = { ...product };
  if (!isProductOwner(product, req.user)) {
    for (const k of ALWAYS_PRIVATE) delete out[k];
    if (!isNetworkUser(req)) delete out.affiliateCommission;
  }
  return out;
}

// =========================================================================
// 1. MARKETPLACE FEED
// =========================================================================
async function listProducts(req, res) {
  try {
    const { sellerId, status } = req.query;
    const { page, limit, skip } = paging(req);
    const match = {};

    if (sellerId !== undefined) {
      if (!isValidId(sellerId)) return bad(res, "INVALID_SELLER_ID");
      match.sellerId = new mongoose.Types.ObjectId(sellerId);
      const isOwner = req.user?._id && String(req.user._id) === sellerId;
      // Only the owner can see unlisted stock
      if (!(isOwner && status === "all")) Object.assign(match, VISIBLE);
    } else {
      Object.assign(match, VISIBLE, { quantity: { $gt: 0 } });
    }

    const products = await Product.aggregate([
      { $match: match },
      {
        $addFields: {
          rankingScore: {
            $add: [
              { $cond: [{ $eq: ["$isPremiumVendor", true] }, 50, 0] },
              { $multiply: [{ $ifNull: ["$metrics.conversionRate", 0] }, 10] },
              { $multiply: [{ $ifNull: ["$metrics.referralCount", 0] }, 2] },
              { $multiply: [{ $ifNull: ["$metrics.escrowDisputeRate", 0] }, -30] },
            ],
          },
        },
      },
      { $sort: { rankingScore: -1, createdAt: -1, _id: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    const feed = products.map(({ rankingScore, ...p }) => shape(p, req));
    return res.status(200).json({ ok: true, page, count: feed.length, categoryContext: getUserCategory(req), feed });
  } catch (error) {
    return sendServerError(res, error, "Marketplace feed");
  }
}

// =========================================================================
// 2. PUBLIC STORE PRODUCTS
// =========================================================================
async function getPublicStoreProducts(req, res) {
  try {
    const { page, limit, skip } = paging(req);
    const filter = { ...VISIBLE, quantity: { $gt: 0 } };
    if (req.query.sellerId !== undefined) {
      if (!isValidId(req.query.sellerId)) return bad(res, "INVALID_SELLER_ID");
      filter.sellerId = req.query.sellerId;
    }
    const products = await Product.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean();
    const safe = products.map((p) => shape(p, req));
    return res.status(200).json({ ok: true, page, count: safe.length, products: safe });
  } catch (error) {
    return sendServerError(res, error, "Public store products");
  }
}

// =========================================================================
// 3. SINGLE PRODUCT
// =========================================================================
async function getProductById(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return bad(res, "INVALID_PRODUCT_ID");

    const product = await Product.findById(id).lean();
    if (!product) return bad(res, "PRODUCT_NOT_FOUND", 404);

    const visible = product.isShelved === true && ["LISTED", "ACTIVE"].includes(product.status);
    if (!visible && !isProductOwner(product, req.user)) return bad(res, "PRODUCT_NOT_FOUND", 404);

    return res.status(200).json({ ok: true, product: shape(product, req) });
  } catch (error) {
    return sendServerError(res, error, "Get product by ID");
  }
}

// =========================================================================
// 4. CREATE
// =========================================================================
async function createProduct(req, res) {
  try {
    if (!requireSeller(req, res)) return;
    const b = req.body || {};

    const name = str(b.name, 120);
    if (!name) return bad(res, "NAME_REQUIRED");

    const price = toInt(b.price);
    if (!Number.isSafeInteger(price) || price < MIN_PRICE || price > MAX_PRICE) {
      return res.status(400).json({ ok: false, error: "INVALID_PRODUCT_PRICE", min: MIN_PRICE, max: MAX_PRICE, message: "Price must be a whole number." });
    }
    const quantity = b.quantity === undefined ? 0 : toInt(b.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_QTY) return bad(res, "INVALID_PRODUCT_QUANTITY");
    const deliveryFee = b.deliveryFee === undefined ? 0 : toInt(b.deliveryFee);
    if (!Number.isSafeInteger(deliveryFee) || deliveryFee < 0 || deliveryFee > MAX_DELIVERY) return bad(res, "INVALID_DELIVERY_FEE");

    const status = normalizeStatus(b.status || "LISTED");
    if (!VALID_PRODUCT_STATUSES.includes(status)) return bad(res, "INVALID_PRODUCT_STATUS");

   const catRaw = b.category === undefined ? "general" : str(b.category, 40);
const category = catRaw === null ? null : (catRaw || "general").toLowerCase();
const subCategory = b.subCategory === undefined ? "" : str(b.subCategory, 40);
if (category === null || !CATEGORIES.includes(category) || subCategory === null) {
  return res.status(400).json({ ok: false, error: "INVALID_CATEGORY", allowed: CATEGORIES });
}
const description = b.description === undefined ? "" : str(b.description, 2000);
const imageUrl = b.imageUrl === undefined ? "" : cleanUrl(b.imageUrl);
if (description === null) return bad(res, "INVALID_DESCRIPTION");
if (imageUrl === null) return bad(res, "INVALID_IMAGE_URL");

    // Brand comes from the verified profile only, never from the request
    const brandName = req.user.brand?.name || req.user.brandName || req.user.displayName || "SokoDigi Merchant";

    const doc = {
      sellerId: req.user._id,
      merchantId: req.user._id,
      name,
      brandName,
      category,
      subCategory: subCategory.toLowerCase() || "general",
      price, quantity, deliveryFee, description, imageUrl, status,
      isShelved: status === "LISTED",
      ...feeFields(price), // client-supplied commission is ignored
      metrics: { conversionRate: 0, referralCount: 0, escrowDisputeRate: 0 },
    };
      

    let product;
    for (let i = 0; i < 3 && !product; i++) {
      try {
        product = await Product.create({ ...doc, productCode: generateProductCode() });
      } catch (e) {
        if (!(e.code === 11000 && e.keyPattern?.productCode)) throw e; // retry only on code collision
      }
    }
    if (!product) throw new Error("PRODUCT_CODE_COLLISION");

    return res.status(201).json({ ok: true, message: "Product created successfully.", product });
  } catch (error) {
    return sendServerError(res, error, "Create product");
  }
}

// =========================================================================
// 5. UPDATE (atomic: concurrent sales are never overwritten)
// =========================================================================
async function updateProduct(req, res) {
  try {
    if (!requireSeller(req, res)) return;
    const { id } = req.params;
    if (!isValidId(id)) return bad(res, "INVALID_PRODUCT_ID");

    const product = await Product.findOne({ _id: id, sellerId: req.user._id }).lean();
    if (!product) return bad(res, "PRODUCT_NOT_FOUND", 404);

    const b = req.body || {};
    const set = {};

    for (const [field, max] of [["name", 120], ["description", 2000], ["category", 40], ["subCategory", 40]]) {
      if (b[field] === undefined) continue;
           const v = str(b[field], max);
      if (v === null || (field === "name" && !v)) return bad(res, `INVALID_${field.toUpperCase()}`);
      if (field === "category" && !CATEGORIES.includes(v.toLowerCase())) {
        return res.status(400).json({ ok: false, error: "INVALID_CATEGORY", allowed: CATEGORIES });
      }
      set[field] = field === "category" || field === "subCategory" ? v.toLowerCase() : v;
    }
    if (b.imageUrl !== undefined) {
      const u = cleanUrl(b.imageUrl);
      if (u === null) return bad(res, "INVALID_IMAGE_URL");
      set.imageUrl = u;
    }
    // brandName, affiliateCommission, wholesale fields from the client are ignored on purpose

    if (b.price !== undefined) {
      const p = toInt(b.price);
      if (!Number.isSafeInteger(p) || p < MIN_PRICE || p > MAX_PRICE) return bad(res, "INVALID_PRODUCT_PRICE");
      Object.assign(set, { price: p }, feeFields(p));
    }
    if (b.deliveryFee !== undefined) {
      const d = toInt(b.deliveryFee);
      if (!Number.isSafeInteger(d) || d < 0 || d > MAX_DELIVERY) return bad(res, "INVALID_DELIVERY_FEE");
      set.deliveryFee = d;
    }
    if (b.status !== undefined) {
      const s = normalizeStatus(b.status);
      if (!VALID_PRODUCT_STATUSES.includes(s)) return bad(res, "INVALID_PRODUCT_STATUS");
      set.status = s;
      set.isShelved = s === "LISTED";
    }

    const filter = { _id: id, sellerId: req.user._id };
    const update = {};
    if (Object.keys(set).length) update.$set = set;

    if (b.quantity !== undefined) {
      const q = toInt(b.quantity);
      if (!Number.isSafeInteger(q) || q < 0 || q > MAX_QTY) return bad(res, "INVALID_PRODUCT_QUANTITY");
      const delta = q - product.quantity;
      if (delta !== 0) {
        update.$inc = { quantity: delta }; // relative change keeps sales that happened meanwhile
        if (delta < 0) filter.quantity = { $gte: -delta };
      }
    }
    if (!update.$set && !update.$inc) return bad(res, "NOTHING_TO_UPDATE");

    const updated = await Product.findOneAndUpdate(filter, update, { new: true, runValidators: true });
    if (!updated) return bad(res, "STOCK_CHANGED_RETRY", 409);

    return res.status(200).json({ ok: true, message: "Product updated successfully.", product: updated });
  } catch (error) {
    return sendServerError(res, error, "Update product");
  }
}

// =========================================================================
// 6. DELETE (blocked while orders are open)
// =========================================================================
async function deleteProduct(req, res) {
  try {
    if (!requireSeller(req, res)) return;
    const { id } = req.params;
    if (!isValidId(id)) return bad(res, "INVALID_PRODUCT_ID");

    const owned = await Product.exists({ _id: id, sellerId: req.user._id });
    if (!owned) return bad(res, "PRODUCT_NOT_FOUND", 404);

    const open = await Order.exists({ "items.productId": id, orderStatus: { $in: OPEN_ORDER_STATES } });
    if (open) {
      return res.status(409).json({ ok: false, error: "PRODUCT_HAS_OPEN_ORDERS", message: "Unlist it instead, or finish the open orders first." });
    }

    await Product.deleteOne({ _id: id, sellerId: req.user._id });
    await ShareLink.deleteMany({ productId: id });
    return res.status(200).json({ ok: true, message: "Product deleted successfully.", deletedProductId: id });
  } catch (error) {
    return sendServerError(res, error, "Delete product");
  }
}

// =========================================================================
// 7. UPDATE STATUS
// =========================================================================
async function updateProductStatus(req, res) {
  try {
    if (!requireSeller(req, res)) return;
    const { id } = req.params;
    if (!isValidId(id)) return bad(res, "INVALID_PRODUCT_ID");
    if (!VALID_PRODUCT_STATUSES.includes(req.body?.status)) {
      return res.status(400).json({ ok: false, error: "INVALID_PRODUCT_STATUS", message: "Allowed statuses are LISTED, ACTIVE, and UNLISTED." });
    }
    const status = normalizeStatus(req.body.status);

    const product = await Product.findOneAndUpdate(
      { _id: id, sellerId: req.user._id },
      { $set: { status, isShelved: status === "LISTED" } },
      { new: true, runValidators: true }
    );
    if (!product) return bad(res, "PRODUCT_NOT_FOUND", 404);
    return res.status(200).json({ ok: true, message: "Product status updated successfully.", product });
  } catch (error) {
    return sendServerError(res, error, "Update product status");
  }
}

// =========================================================================
// 8. TOGGLE SHELF  (PATCH /api/products/:id/toggle-shelf)
// =========================================================================
async function toggleProductShelf(req, res) {
  try {
    if (!requireSeller(req, res)) return;
    const { id } = req.params;
    if (!isValidId(id)) return bad(res, "INVALID_PRODUCT_ID");

    const current = await Product.findOne({ _id: id, sellerId: req.user._id }).select("isShelved status").lean();
    if (!current) return bad(res, "PRODUCT_NOT_FOUND", 404);

    const shouldShelve = !(current.isShelved === true && current.status !== "UNLISTED");
    const product = await Product.findOneAndUpdate(
      { _id: id, sellerId: req.user._id },
      { $set: { isShelved: shouldShelve, status: shouldShelve ? "LISTED" : "UNLISTED" } },
      { new: true }
    );
    return res.status(200).json({
      ok: true,
      message: shouldShelve ? "Product is now visible on your storefront." : "Product has been removed from your storefront.",
      product,
    });
  } catch (error) {
    return sendServerError(res, error, "Toggle product shelf");
  }
}

// =========================================================================
// 9. SMART DISCOVERY FEEDS
// =========================================================================
async function getSmartDiscoveries(req, res) {
  try {
    const type = typeof req.query.type === "string" ? req.query.type : "trending";
    const requested = req.query.limit === undefined ? 8 : toInt(req.query.limit);
    if (!Number.isInteger(requested) || requested < 1) return bad(res, "INVALID_LIMIT");
    const limit = Math.min(requested, 50);

    const filter = { ...VISIBLE, quantity: { $gt: 0 } };
    let sort = { createdAt: -1 };

    switch (type) {
      case "best-sellers":
        filter["metrics.conversionRate"] = { $gte: 0.12 };
        sort = { "metrics.conversionRate": -1, "metrics.referralCount": -1, createdAt: -1 };
        break;
      case "top-products":
        filter.isPremiumVendor = true;
        filter["metrics.escrowDisputeRate"] = { $lt: 0.03 };
        sort = { "metrics.referralCount": -1, createdAt: -1 };
        break;
      case "fresh-drops": {
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
        filter.createdAt = { $gte: oneWeekAgo };
        break;
      }
      case "trending":
      default:
        sort = { "metrics.referralCount": -1, createdAt: -1 };
    }

    const products = await Product.find(filter).sort(sort).limit(limit).lean();
    const feed = products.map((p) => shape(p, req)); // strips metrics for everyone but the owner
    return res.status(200).json({ ok: true, smartCategory: type, count: feed.length, feed });
  } catch (error) {
    return sendServerError(res, error, "Smart product discoveries");
  }
}

// =========================================================================
// 10. SHARE PRODUCT: creates the attributable link (requires a marketer login)
// Route must now use `authenticate`.
// =========================================================================
async function shareProduct(req, res) {
  try {
    if (!requireSeller(req, res)) return;
    const productId = req.body?.productId || req.params.id;
    if (!isValidId(productId)) return bad(res, "INVALID_PRODUCT_ID");

    const product = await Product.findById(productId).select("_id name status isShelved sellerId").lean();
    const visible = product && product.isShelved === true && ["LISTED", "ACTIVE"].includes(product.status);
    if (!visible) return bad(res, "PRODUCT_NOT_AVAILABLE_FOR_SHARING", 404);

    const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
    const base = `${frontendUrl}/product/${product._id}`;

    // Sharing your own product earns no bonus: return the plain link
    if (String(product.sellerId) === String(req.user._id)) {
      return res.status(200).json({ ok: true, productId: String(product._id), productName: product.name, shareUrl: base, attributed: false });
    }

    const find = () => ShareLink.findOne({ productId: product._id, promoterId: req.user._id }).lean();
    let link = await find();
    if (!link) {
      try {
        link = (await ShareLink.create({
          code: crypto.randomBytes(9).toString("base64url"),
          productId: product._id,
          promoterId: req.user._id,
          sellerId: product.sellerId,
        })).toObject();
      } catch (e) {
        if (e.code !== 11000) throw e;
        link = await find(); // two taps at once: reuse the winner
      }
    }

    return res.status(200).json({
      ok: true,
      message: "Product share link generated successfully.",
      productId: String(product._id),
      productName: product.name,
      shareUrl: `${base}?ref=${link.code}`,
      attributed: true,
    });
  } catch (error) {
    return sendServerError(res, error, "Share product");
  }
}

// =========================================================================
// 11. PURGE (same safe path as delete)
// =========================================================================
const purgeProductAsset = deleteProduct;

// =========================================================================
// 12. HERO BANNER (public: no commission data)
// =========================================================================
async function getHeroBannerFeed(req, res) {
  try {
    const banner = await Product.aggregate([
      {
        $match: {
          ...VISIBLE,
          quantity: { $gt: 5 },
          "metrics.escrowDisputeRate": { $lt: 0.05 },
        },
      },
      {
        $addFields: {
          bannerScore: {
            $add: [
              { $cond: [{ $eq: ["$isPremiumVendor", true] }, 30, 0] },
              { $multiply: [{ $ifNull: ["$metrics.conversionRate", 0] }, 50] },
              { $multiply: [{ $ifNull: ["$metrics.referralCount", 0] }, 2] },
            ],
          },
        },
      },
      { $sort: { bannerScore: -1, _id: -1 } },
      { $limit: 5 },
      { $project: { name: 1, price: 1, imageUrl: 1, description: 1, brandName: 1 } },
    ]);
    return res.status(200).json({ ok: true, banner });
  } catch (error) {
    return sendServerError(res, error, "Hero banner feed");
  }
}

module.exports = {
  generateProductCode,
  listProducts,
  getPublicStoreProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  updateProductStatus,
  purgeProductAsset,
  getSmartDiscoveries,
  shareProduct,
  toggleProductShelf,
  getHeroBannerFeed,
};
