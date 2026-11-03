const crypto = require("crypto");
const mongoose = require("mongoose");
const Product = require("../../models/Product");
const Order = require("../../models/Order");
const ShareLink = require("../../models/ShareLink");
const { PLATFORM_BP, AFFILIATE_BP } = require("../config/fees");
const CATEGORIES = Product.schema.path("category").enumValues;
const User = require("../../models/User");
const UserProfile = require("../../models/UserProfile");
const ManualSale = require("../../models/ManualSale");
const { changeStock } = require("../../services/stockLedger");
const { entitlementsFor, cheapest } = require("../membership/entitlements");

// =========================================================================
// CONFIG & HELPERS
// =========================================================================
const VALID_PRODUCT_STATUSES = ["LISTED", "UNLISTED", "ACTIVE"];
const VISIBLE = { status: { $in: ["LISTED", "ACTIVE"] }, isShelved: true };
const OPEN_ORDER_STATES = ["PENDING_PAYMENT", "PROCESSING", "DISPATCHED", "DISPUTED"];
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

const UserProfile = require("../../models/UserProfile");

const withShop = (p, out) => {
  const { shopScore, ...safe } = out || {};
  return {
    ...safe,
    goldShop: !!p?.goldShop,
    sellerUsername: p?.sellerUsername || "",
  };
};

async function withShops(rows) {
  const ids = [...new Set(rows.map((r) => String(r.sellerId)))];
  const profs = await UserProfile.find({ userId: { $in: ids } }).select("userId brandName username").lean();
  const m = new Map(profs.map((p) => [String(p.userId), p]));
  return rows.map((r) => { const p = m.get(String(r.sellerId)); return { ...r, brandName: p?.brandName || r.brandName, sellerUsername: p?.username || "" }; });
}



// Whole numbers only. Accepts 500 or "500", rejects 99.99, "1e9", NaN.
const toInt = (v) =>
  typeof v === "number"
    ? v
    : typeof v === "string" && /^\d{1,12}$/.test(v.trim())
      ? Number(v)
      : NaN;

const str = (v, max) =>
  typeof v === "string" && v.trim().length <= max ? v.trim() : null;

function cleanUrl(v) {
  if (v === "") return "";

  try {
    const u = new URL(v);
    return u.protocol === "https:" && v.length <= 500 ? u.toString() : null;
  } catch {
    return null;
  }
}

// Accepts only images uploaded to your Cloudinary products folder.
function cleanImageUrl(v, folder = "sokodigi/products") {
  if (v === "") return "";

  const u = cleanUrl(v);
  if (u === null) return null;

  const { hostname, pathname } = new URL(u);
  const cloud = (process.env.CLOUDINARY_CLOUD_NAME || "").replace(/[^\w-]/g, "");

  if (hostname !== "res.cloudinary.com" || !cloud) return null;

  const re = new RegExp(
    `^/${cloud}/image/upload/(v\\d+/)?${folder}/[\\w-]{1,80}\\.(jpg|jpeg|png|webp)$`
  );

  return re.test(pathname) ? u : null;
}

function paging(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

// Fees are computed on the server only (single source: config/fees.js).
function feeFields(price) {
  const affiliate = Math.round((price * AFFILIATE_BP) / 10000);
  const platform = Math.round((price * PLATFORM_BP) / 10000);
  const net = price - affiliate - platform;

  return {
    affiliateCommission: affiliate,
    wholesalePrice: net,
    resellerWholesaleCost: net,
  };
}

const bad = (res, error, status = 400) =>
  res.status(status).json({ ok: false, error });

function sendServerError(res, error, context) {
  console.error(`❌ ${context}:`, error.stack || error.message);
  return res.status(500).json({
    ok: false,
    error: "INTERNAL_SERVER_ERROR",
    message: "An unexpected server error occurred.",
  });
}

// Returns true if the caller may manage products; otherwise has already replied.
function requireSeller(req, res) {
  if (!req.user?._id) {
    bad(res, "AUTHENTICATION_REQUIRED", 401);
    return false;
  }

  if (!isNetworkUser(req)) {
    bad(res, "MARKETER_ACCOUNT_REQUIRED", 403);
    return false;
  }

  return true;
}

// Owner sees everything. Marketers see the commission only. Everyone else sees neither.
function shape(product, req) {
  if (!product) return product;

  const out = { ...product };

  if (!isProductOwner(product, req.user)) {
    for (const key of ALWAYS_PRIVATE) delete out[key];
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

      // Only the owner can see unlisted stock.
      if (!(isOwner && status === "all")) Object.assign(match, VISIBLE);
    } else {
      Object.assign(match, VISIBLE, { quantity: { $gt: 0 } });

      if (
        typeof req.query.category === "string" &&
        CATEGORIES.includes(req.query.category)
      ) {
        match.category = req.query.category;
      }
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
              { $multiply: [{ $ifNull: ["$shopScore", 20] }, 0.5] },
            ],
          },
        },
      },
      {
        $sort:
          req.query.sort === "price-asc"
            ? { price: 1, _id: -1 }
            : req.query.sort === "price-desc"
              ? { price: -1, _id: -1 }
              : req.query.sort === "newest"
                ? { createdAt: -1, _id: -1 }
                : { rankingScore: -1, createdAt: -1, _id: -1 },
      },
      { $skip: skip },
      { $limit: limit },
    ]);

    const rows = await withShops(products);
    const feed = rows.map(({ rankingScore, ...p }) => withShop(p, shape(p, req)));
    
    return res.status(200).json({
      ok: true,
      page,
      count: feed.length,
      categoryContext: getUserCategory(req),
      feed,
    });
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

    const products = await Product.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const safe = products.map((product) =>
      withShop(product, shape(product, req))
    );

    return res.status(200).json({
      ok: true,
      page,
      count: safe.length,
      products: safe,
    });
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

    const visible =
      product.isShelved === true &&
      ["LISTED", "ACTIVE"].includes(product.status);

    if (!visible && !isProductOwner(product, req.user)) {
      return bad(res, "PRODUCT_NOT_FOUND", 404);
    }

    return res.status(200).json({
      ok: true,
      product: withShop(product, shape(product, req)),
    });
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
      return res.status(400).json({
        ok: false,
        error: "INVALID_PRODUCT_PRICE",
        min: MIN_PRICE,
        max: MAX_PRICE,
        message: "Price must be a whole number.",
      });
    }

    const quantity = b.quantity === undefined ? 0 : toInt(b.quantity);
    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 0 ||
      quantity > MAX_QTY
    ) {
      return bad(res, "INVALID_PRODUCT_QUANTITY");
    }

    const deliveryFee = b.deliveryFee === undefined ? 0 : toInt(b.deliveryFee);
    if (
      !Number.isSafeInteger(deliveryFee) ||
      deliveryFee < 0 ||
      deliveryFee > MAX_DELIVERY
    ) {
      return bad(res, "INVALID_DELIVERY_FEE");
    }

    const status = normalizeStatus(b.status || "LISTED");
    if (!VALID_PRODUCT_STATUSES.includes(status)) {
      return bad(res, "INVALID_PRODUCT_STATUS");
    }

    const catRaw = b.category === undefined ? "general" : str(b.category, 40);
    const category =
      catRaw === null ? null : (catRaw || "general").toLowerCase();
    const subCategory =
      b.subCategory === undefined ? "" : str(b.subCategory, 40);

    if (
      category === null ||
      !CATEGORIES.includes(category) ||
      subCategory === null
    ) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_CATEGORY",
        allowed: CATEGORIES,
      });
    }

    const description =
      b.description === undefined ? "" : str(b.description, 2000);
    const imageUrl =
      b.imageUrl === undefined ? "" : cleanImageUrl(b.imageUrl);

    if (description === null) return bad(res, "INVALID_DESCRIPTION");
    if (imageUrl === null) return bad(res, "INVALID_IMAGE_URL");

    // Brand comes from the verified profile only, never from the request.
    const prof = await UserProfile.findOne({ userId: req.user._id })
      .select("brandName")
      .lean();

    const brandName = prof?.brandName || "SokoDigi Merchant";

    const doc = {
      sellerId: req.user._id,
      merchantId: req.user._id,
      name,
      brandName,
      category,
      subCategory: subCategory.toLowerCase() || "general",
      price,
      quantity,
      deliveryFee,
      description,
      imageUrl,
      status,
      isShelved: status === "LISTED",
      ...feeFields(price),
      metrics: {
        conversionRate: 0,
        referralCount: 0,
        escrowDisputeRate: 0,
      },
    };

    let product;

    for (let i = 0; i < 3 && !product; i++) {
      try {
        const ent = entitlementsFor(req.user);
        const used = await Product.countDocuments({ sellerId: req.user._id });

        if (used >= ent.limits.products) {
          return res.status(403).json({
            ok: false,
            error: "PLAN_LIMIT_REACHED",
            limit: "products",
            max: ent.limits.products,
            used,
            requiredPlan: cheapest((p) => p.limits.products > used),
          });
        }

        product = await Product.create({
          ...doc,
          productCode: generateProductCode(),
        });
      } catch (error) {
        if (!(error.code === 11000 && error.keyPattern?.productCode)) {
          throw error;
        }
      }
    }

    if (!product) throw new Error("PRODUCT_CODE_COLLISION");

    if (quantity > 0) {
      await require("../../services/stockLedger")
        .record(null, {
          product,
          delta: quantity,
          type: "initial",
          ref: `init:${product._id}`,
          note: "Opening stock",
          actorId: req.user._id,
        })
        .catch(() => {});
    }

    return res.status(201).json({
      ok: true,
      message: "Product created successfully.",
      product,
    });
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

    const product = await Product.findOne({
      _id: id,
      sellerId: req.user._id,
    }).lean();

    if (!product) return bad(res, "PRODUCT_NOT_FOUND", 404);

    const b = req.body || {};
    const set = {};

    for (const [field, max] of [
      ["name", 120],
      ["description", 2000],
      ["category", 40],
      ["subCategory", 40],
    ]) {
      if (b[field] === undefined) continue;

      const value = str(b[field], max);

      if (value === null || (field === "name" && !value)) {
        return bad(res, `INVALID_${field.toUpperCase()}`);
      }

      if (
        field === "category" &&
        !CATEGORIES.includes(value.toLowerCase())
      ) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_CATEGORY",
          allowed: CATEGORIES,
        });
      }

      set[field] =
        field === "category" || field === "subCategory"
          ? value.toLowerCase()
          : value;
    }

    if (b.imageUrl !== undefined) {
      const imageUrl = cleanImageUrl(b.imageUrl);
      if (imageUrl === null) return bad(res, "INVALID_IMAGE_URL");
      set.imageUrl = imageUrl;
    }

    // brandName, affiliateCommission, and wholesale fields from the client are ignored.

    if (b.price !== undefined) {
      const price = toInt(b.price);

      if (
        !Number.isSafeInteger(price) ||
        price < MIN_PRICE ||
        price > MAX_PRICE
      ) {
        return bad(res, "INVALID_PRODUCT_PRICE");
      }

      Object.assign(set, { price }, feeFields(price));
    }

    if (b.deliveryFee !== undefined) {
      const deliveryFee = toInt(b.deliveryFee);

      if (
        !Number.isSafeInteger(deliveryFee) ||
        deliveryFee < 0 ||
        deliveryFee > MAX_DELIVERY
      ) {
        return bad(res, "INVALID_DELIVERY_FEE");
      }

      set.deliveryFee = deliveryFee;
    }

    if (b.status !== undefined) {
      const status = normalizeStatus(b.status);

      if (!VALID_PRODUCT_STATUSES.includes(status)) {
        return bad(res, "INVALID_PRODUCT_STATUS");
      }

      set.status = status;
      set.isShelved = status === "LISTED";
    }

    const filter = { _id: id, sellerId: req.user._id };
    const update = {};

    if (Object.keys(set).length) update.$set = set;
    if (!update.$set && !update.$inc) return bad(res, "NOTHING_TO_UPDATE");

    const updated = await Product.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true,
    });

    if (!updated) return bad(res, "STOCK_CHANGED_RETRY", 409);

    return res.status(200).json({
      ok: true,
      message: "Product updated successfully.",
      product: updated,
    });
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

    const open = await Order.exists({
      "items.productId": id,
      orderStatus: { $in: OPEN_ORDER_STATES },
    });

    if (open) {
      return res.status(409).json({
        ok: false,
        error: "PRODUCT_HAS_OPEN_ORDERS",
        message: "Unlist it instead, or finish the open orders first.",
      });
    }

    await Product.deleteOne({ _id: id, sellerId: req.user._id });
    await ShareLink.deleteMany({ productId: id });

    return res.status(200).json({
      ok: true,
      message: "Product deleted successfully.",
      deletedProductId: id,
    });
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
      return res.status(400).json({
        ok: false,
        error: "INVALID_PRODUCT_STATUS",
        message: "Allowed statuses are LISTED, ACTIVE, and UNLISTED.",
      });
    }

    const status = normalizeStatus(req.body.status);
    const product = await Product.findOneAndUpdate(
      { _id: id, sellerId: req.user._id },
      { $set: { status, isShelved: status === "LISTED" } },
      { new: true, runValidators: true }
    );

    if (!product) return bad(res, "PRODUCT_NOT_FOUND", 404);

    return res.status(200).json({
      ok: true,
      message: "Product status updated successfully.",
      product,
    });
  } catch (error) {
    return sendServerError(res, error, "Update product status");
  }
}

// =========================================================================
// 8. TOGGLE SHELF (PATCH /api/products/:id/toggle-shelf)
// =========================================================================
async function toggleProductShelf(req, res) {
  try {
    if (!requireSeller(req, res)) return;

    const { id } = req.params;
    if (!isValidId(id)) return bad(res, "INVALID_PRODUCT_ID");

    const current = await Product.findOne({
      _id: id,
      sellerId: req.user._id,
    })
      .select("isShelved status")
      .lean();

    if (!current) return bad(res, "PRODUCT_NOT_FOUND", 404);

    const shouldShelve = !(
      current.isShelved === true && current.status !== "UNLISTED"
    );

    const product = await Product.findOneAndUpdate(
      { _id: id, sellerId: req.user._id },
      {
        $set: {
          isShelved: shouldShelve,
          status: shouldShelve ? "LISTED" : "UNLISTED",
        },
      },
      { new: true }
    );

    return res.status(200).json({
      ok: true,
      message: shouldShelve
        ? "Product is now visible on your storefront."
        : "Product has been removed from your storefront.",
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
    const type =
      typeof req.query.type === "string" ? req.query.type : "trending";
    const requested =
      req.query.limit === undefined ? 8 : toInt(req.query.limit);

    if (!Number.isInteger(requested) || requested < 1) {
      return bad(res, "INVALID_LIMIT");
    }

    const limit = Math.min(requested, 50);
    const filter = { ...VISIBLE, quantity: { $gt: 0 } };
    let sort = { createdAt: -1 };

    switch (type) {
      case "best-sellers":
        filter["metrics.conversionRate"] = { $gte: 0.12 };
        sort = {
          "metrics.conversionRate": -1,
          "metrics.referralCount": -1,
          createdAt: -1,
        };
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
    const feed = products.map((product) =>
      withShop(product, shape(product, req))
    );

    return res.status(200).json({
      ok: true,
      smartCategory: type,
      count: feed.length,
      feed,
    });
  } catch (error) {
    return sendServerError(res, error, "Smart product discoveries");
  }
}

// =========================================================================
// 10. SHARE PRODUCT
// =========================================================================
async function shareProduct(req, res) {
  try {
    if (!requireSeller(req, res)) return;

    const productId = req.body?.productId || req.params.id;
    if (!isValidId(productId)) return bad(res, "INVALID_PRODUCT_ID");

    const product = await Product.findById(productId)
      .select("_id name status isShelved sellerId")
      .lean();

    const visible =
      product &&
      product.isShelved === true &&
      ["LISTED", "ACTIVE"].includes(product.status);

    if (!visible) {
      return bad(res, "PRODUCT_NOT_AVAILABLE_FOR_SHARING", 404);
    }

    if (!entitlementsFor(req.user).features.promoteOthers) {
      return res.status(403).json({
        ok: false,
        error: "PLAN_UPGRADE_REQUIRED",
        feature: "promoteOthers",
        requiredPlan: cheapest((p) => p.features.promoteOthers),
      });
    }

    const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173")
      .replace(/\/$/, "");
    const base = `${frontendUrl}/product-details/${product._id}`;

    // Sharing your own product earns no bonus: return the plain link.
    if (String(product.sellerId) === String(req.user._id)) {
      return res.status(200).json({
        ok: true,
        productId: String(product._id),
        productName: product.name,
        shareUrl: base,
        attributed: false,
      });
    }

    const find = () =>
      ShareLink.findOne({
        productId: product._id,
        promoterId: req.user._id,
      }).lean();

    let link = await find();

    if (!link) {
      try {
        link = (
          await ShareLink.create({
            code: crypto.randomBytes(9).toString("base64url"),
            productId: product._id,
            promoterId: req.user._id,
            sellerId: product.sellerId,
          })
        ).toObject();
      } catch (error) {
        if (error.code !== 11000) throw error;
        link = await find();
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
      {
        $project: {
          name: 1,
          price: 1,
          imageUrl: 1,
          description: 1,
          brandName: 1,
          goldShop: 1,
          sellerUsername: 1,
        },
      },
    ]);  
    
    const [named] = await withShops([typeof product.toObject === "function" ? product.toObject() : product]);
    res.json({ ok: true, product: withShop(named, shape(named, req)) });
    
    return res.status(200).json({
      ok: true,
      banner: banner.map((product) => withShop(product, product)),
    });
    
  } catch (error) {
    return sendServerError(res, error, "Hero banner feed");
  }
}

// GET /api/products/shared            -> signed-in marketer's shared products
// GET /api/products/shared?username=  -> public shop's shared products
async function getSharedProducts(req, res) {
  try {
    let promoterId;

    if (req.query.username !== undefined) {
      const username = String(req.query.username).toLowerCase().trim();
      if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        return bad(res, "INVALID_USERNAME");
      }

      const profile = await UserProfile.findOne({
        username,
        publicProfile: true,
      })
        .select("userId")
        .lean();

      const owner =
        profile &&
        (await User.findOne({
          _id: profile.userId,
          accountCategory: "network",
          membershipStatus: "active",
          isActive: true,
          $or: [
            { membershipExpiresAt: null },
            { membershipExpiresAt: { $gt: new Date() } },
          ],
        })
          .select("_id")
          .lean());

      if (!owner) return res.json({ ok: true, products: [] });
      promoterId = owner._id;
    } else {
      if (!req.user?._id) {
        return bad(res, "AUTHENTICATION_REQUIRED", 401);
      }
      promoterId = req.user._id;
    }

    const links = await ShareLink.find({ promoterId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const products = await Product.find({
      _id: { $in: links.map((link) => link.productId) },
      ...VISIBLE,
      quantity: { $gt: 0 },
    })
      .select(
        "productCode name brandName category price quantity deliveryFee imageUrl goldShop sellerUsername"
      )
      .lean();

    const codes = new Map(
      links.map((link) => [String(link.productId), link.code])
    );

    return res.json({
      ok: true,
      products: products.map((product) => ({
        ...withShop(product, product),
        shareCode: codes.get(String(product._id)),
      })),
    });
  } catch (error) {
    return sendServerError(res, error, "Shared products");
  }
}

// PATCH /api/products/:id/stock { delta }
async function adjustStock(req, res) {
  try {
    if (!requireSeller(req, res)) return;

    const { id } = req.params;
    if (!isValidId(id)) return bad(res, "INVALID_PRODUCT_ID");

    const delta = req.body?.delta;
    if (
      !Number.isInteger(delta) ||
      delta === 0 ||
      Math.abs(delta) > MAX_QTY
    ) {
      return bad(res, "INVALID_STOCK_CHANGE");
    }

    const note =
      typeof req.body?.note === "string"
        ? req.body.note.trim().slice(0, 200)
        : "";

    const type =
      delta > 0
        ? req.body?.kind === "restock"
          ? "restock"
          : "adjustment"
        : "adjustment";

    const product = await mongoose.connection.transaction((session) =>
      changeStock(session, {
        productId: id,
        sellerId: req.user._id,
        delta,
        type,
        note,
        actorId: req.user._id,
        max: MAX_QTY,
      })
    );

    if (!product) {
      return (await Product.exists({ _id: id, sellerId: req.user._id }))
        ? bad(res, "STOCK_CHANGE_NOT_POSSIBLE", 409)
        : bad(res, "PRODUCT_NOT_FOUND", 404);
    }

    return res.json({ ok: true, product });
  } catch (error) {
    return sendServerError(res, error, "Adjust stock");
  }
}

// POST /api/products/:id/manual-sale: an offline sale. Works on unlisted products too.
async function recordManualSale(req, res) {
  try {
    if (!requireSeller(req, res)) return;

    const { id } = req.params;
    if (!isValidId(id)) return bad(res, "INVALID_PRODUCT_ID");

    const b = req.body || {};
    const quantity = toInt(b.quantity);

    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_QTY
    ) {
      return bad(res, "INVALID_QUANTITY");
    }

    const clientRef =
      typeof b.clientRef === "string" &&
      /^[A-Za-z0-9_-]{16,64}$/.test(b.clientRef)
        ? b.clientRef
        : null;

    if (!clientRef) return bad(res, "CLIENT_REF_REQUIRED");

    const customerName = b.customerName ? str(b.customerName, 80) : "";
    const note = b.note ? str(b.note, 200) : "";

    if (customerName === null || note === null) {
      return bad(res, "INVALID_TEXT");
    }

    const unitPrice =
      b.unitPrice === undefined || b.unitPrice === ""
        ? null
        : toInt(b.unitPrice);

    if (
      unitPrice !== null &&
      (!Number.isSafeInteger(unitPrice) ||
        unitPrice < 1 ||
        unitPrice > MAX_PRICE)
    ) {
      return bad(res, "INVALID_PRODUCT_PRICE");
    }

    const prior = await ManualSale.findOne({
      sellerId: req.user._id,
      clientRef,
    }).lean();

    if (prior) return res.json({ ok: true, replay: true, sale: prior });

    const sale = await mongoose.connection.transaction(async (session) => {
      const product = await changeStock(session, {
        productId: id,
        sellerId: req.user._id,
        delta: -quantity,
        type: "sale_pos",
        ref: `pos:${req.user._id}:${clientRef}`,
        note: customerName ? `Sold to ${customerName}` : "Counter sale",
        actorId: req.user._id,
      });

      if (!product) {
        const exists = await Product.exists({
          _id: id,
          sellerId: req.user._id,
        }).session(session);

        throw Object.assign(
          new Error(exists ? "INSUFFICIENT_STOCK" : "PRODUCT_NOT_FOUND"),
          { http: exists ? 409 : 404 }
        );
      }

      const price = unitPrice ?? product.price;
      const [created] = await ManualSale.create(
        [
          {
            sellerId: req.user._id,
            productId: product._id,
            productName: product.name,
            quantity,
            unitPrice: price,
            total: price * quantity,
            customerName,
            note,
            clientRef,
          },
        ],
        { session }
      );

      return created;
    });

    return res.status(201).json({ ok: true, sale });
  } catch (error) {
    if (error.http) return bad(res, error.message, error.http);

    if (error.code === 11000) {
      const prior = await ManualSale.findOne({
        sellerId: req.user._id,
        clientRef: req.body?.clientRef,
      }).lean();

      if (prior) return res.json({ ok: true, replay: true, sale: prior });
    }

    return sendServerError(res, error, "Record manual sale");
  }
}

// GET /api/products/manual-sales
async function listManualSales(req, res) {
  try {
    if (!requireSeller(req, res)) return;

    const sales = await ManualSale.find({ sellerId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("-__v")
      .lean();

    return res.json({ ok: true, sales });
  } catch (error) {
    return sendServerError(res, error, "List manual sales");
  }
}

// POST /api/products/manual-sales/:saleId/void: within 24 hours; restores stock.
async function voidManualSale(req, res) {
  try {
    if (!requireSeller(req, res)) return;

    const { saleId } = req.params;
    if (!isValidId(saleId)) return bad(res, "INVALID_ID");

    const sale = await ManualSale.findOne({
      _id: saleId,
      sellerId: req.user._id,
    }).lean();

    if (!sale) return bad(res, "SALE_NOT_FOUND", 404);
    if (sale.voided) return bad(res, "ALREADY_VOIDED", 409);

    if (Date.now() - new Date(sale.createdAt).getTime() > 24 * 3600 * 1000) {
      return bad(res, "VOID_WINDOW_PASSED", 409);
    }

    await mongoose.connection.transaction(async (session) => {
      const flipped = await ManualSale.findOneAndUpdate(
        { _id: sale._id, voided: false },
        { $set: { voided: true, voidedAt: new Date() } },
        { session }
      );

      if (!flipped) {
        throw Object.assign(new Error("ALREADY_VOIDED"), { http: 409 });
      }

      await changeStock(session, {
        productId: sale.productId,
        delta: sale.quantity,
        type: "void",
        ref: `void:${sale._id}`,
        note: "Sale undone",
        actorId: req.user._id,
      });
    });

    return res.json({ ok: true });
  } catch (error) {
    if (error.http) return bad(res, error.message, error.http);
    return sendServerError(res, error, "Void manual sale");
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
  getSharedProducts,
  voidManualSale,
  listManualSales,
  recordManualSale,
  adjustStock,
};
