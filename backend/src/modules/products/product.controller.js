
// backend/controllers/product.controller.js

const crypto = require("crypto");
const mongoose = require("mongoose");
const Product = require("../../models/Product");

// =========================================================================
// CONFIGURATION & HELPERS
// =========================================================================

const VALID_PRODUCT_STATUSES = ["LISTED", "UNLISTED", "ACTIVE"];

function generateProductCode() {
  return `SKD-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function isValidId(id) {
  return mongoose.isValidObjectId(id);
}

function normalizeStatus(status) {
  if (status === "ACTIVE") return "LISTED";
  return status;
}

function getUserCategory(req) {
  return req.userCategory || "guest";
}

function isNetworkUser(req) {
  return getUserCategory(req) === "network";
}

function isProductOwner(product, user) {
  if (!product || !user?._id) return false;

  return String(product.sellerId) === String(user._id);
}

function sendServerError(res, error, context) {
  console.error(`❌ ${context}:`, error.stack || error.message);

  return res.status(500).json({
    ok: false,
    error: "INTERNAL_SERVER_ERROR",
    message: "An unexpected server error occurred.",
  });
}

function redactPrivateProductFields(product) {
  if (!product) return product;

  const {
    affiliateCommission,
    wholesalePrice,
    resellerWholesaleCost,
    internalNotes,
    ...publicProduct
  } = product;

  return publicProduct;
}

function redactProductIfNeeded(product, req) {
  const canViewNetworkData =
    isNetworkUser(req) || isProductOwner(product, req.user);

  return canViewNetworkData
    ? product
    : redactPrivateProductFields(product);
}

// =========================================================================
// 1. MARKETPLACE FEED
// =========================================================================

async function listProducts(req, res) {
  try {
    const user = req.user;
    const authenticated = Boolean(user?._id);
    const userCategory = getUserCategory(req);

    const { sellerId, status } = req.query;

    const match = {};

    // Seller inventory request.
    if (sellerId) {
      if (!isValidId(sellerId)) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_SELLER_ID",
        });
      }

      match.sellerId = new mongoose.Types.ObjectId(sellerId);

      // status=all allows a merchant to view unlisted stock.
      if (status !== "all") {
        match.status = { $ne: "UNLISTED" };
      }
    } else {
      // Public marketplace: do not show unlisted or out-of-stock items.
      match.status = { $ne: "UNLISTED" };
      match.isShelved = true;
      match.quantity = { $gt: 0 };

      // Network users may also see their own unlisted products.
      if (userCategory === "network" && authenticated) {
        match.$or = [
          { status: { $ne: "UNLISTED" }, isShelved: true },
          { sellerId: new mongoose.Types.ObjectId(user._id) },
        ];
      }
    }

    const pipeline = [
      { $match: match },

      {
        $addFields: {
          conversionRateSafe: {
            $ifNull: ["$metrics.conversionRate", 0],
          },
          referralCountSafe: {
            $ifNull: ["$metrics.referralCount", 0],
          },
          escrowDisputeRateSafe: {
            $ifNull: ["$metrics.escrowDisputeRate", 0],
          },
        },
      },

      {
        $addFields: {
          rankingScore: {
            $add: [
              {
                $cond: [
                  { $eq: ["$isPremiumVendor", true] },
                  50,
                  0,
                ],
              },
              { $multiply: ["$conversionRateSafe", 10] },
              { $multiply: ["$referralCountSafe", 2] },
              { $multiply: ["$escrowDisputeRateSafe", -30] },
            ],
          },
        },
      },

      { $sort: { rankingScore: -1, createdAt: -1 } },
    ];

    // Ordinary buyers must not receive commission or wholesale information.
    if (userCategory !== "network" && !sellerId) {
      pipeline.push({
        $project: {
          affiliateCommission: 0,
          wholesalePrice: 0,
          resellerWholesaleCost: 0,
          metrics: 0,
          internalNotes: 0,
          conversionRateSafe: 0,
          referralCountSafe: 0,
          escrowDisputeRateSafe: 0,
          rankingScore: 0,
        },
      });
    }

    const products = await Product.aggregate(pipeline);

    return res.status(200).json({
      ok: true,
      count: products.length,
      categoryContext: userCategory,
      feed: products,
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
    const products = await Product.find({
      status: { $ne: "UNLISTED" },
      isShelved: true,
      quantity: { $gt: 0 },
    })
      .sort({ createdAt: -1 })
      .lean();

    const safeProducts = products.map((product) =>
      redactProductIfNeeded(product, req)
    );

    return res.status(200).json({
      ok: true,
      count: safeProducts.length,
      products: safeProducts,
    });
  } catch (error) {
    return sendServerError(res, error, "Public store products");
  }
}

// =========================================================================
// 3. GET A SINGLE PRODUCT
// =========================================================================

async function getProductById(req, res) {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PRODUCT_ID",
      });
    }

    const product = await Product.findById(id).lean();

    if (!product) {
      return res.status(404).json({
        ok: false,
        error: "PRODUCT_NOT_FOUND",
      });
    }

    // Do not expose hidden products to unauthorized users.
    const isOwner = isProductOwner(product, req.user);

    if (
      product.status === "UNLISTED" &&
      !isOwner &&
      !isNetworkUser(req)
    ) {
      return res.status(404).json({
        ok: false,
        error: "PRODUCT_NOT_FOUND",
      });
    }

    return res.status(200).json({
      ok: true,
      product: redactProductIfNeeded(product, req),
    });
  } catch (error) {
    return sendServerError(res, error, "Get product by ID");
  }
}

// =========================================================================
// 4. CREATE A PRODUCT
// =========================================================================

async function createProduct(req, res) {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        ok: false,
        error: "AUTHENTICATION_REQUIRED",
      });
    }

    const {
      name,
      price,
      category,
      subCategory,
      quantity,
      deliveryFee,
      description,
      status,
      imageUrl,
      affiliateCommission,
      brandName,
    } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      price === undefined ||
      price === null ||
      price === ""
    ) {
      return res.status(400).json({
        ok: false,
        error: "NAME_AND_PRICE_REQUIRED",
      });
    }

    const numericPrice = Number(price);
    const numericCommission = Number(affiliateCommission ?? 0);
    const numericQuantity = Number(quantity ?? 0);
    const numericDeliveryFee = Number(deliveryFee ?? 0);

    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PRODUCT_PRICE",
      });
    }

    if (
      !Number.isFinite(numericCommission) ||
      numericCommission < 0 ||
      numericCommission >= numericPrice
    ) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_AFFILIATE_COMMISSION",
        message:
          "Commission must be zero or greater and less than the retail price.",
      });
    }

    if (
      !Number.isInteger(numericQuantity) ||
      numericQuantity < 0
    ) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PRODUCT_QUANTITY",
      });
    }

    if (
      !Number.isFinite(numericDeliveryFee) ||
      numericDeliveryFee < 0
    ) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_DELIVERY_FEE",
      });
    }

    const normalizedStatus = normalizeStatus(status || "LISTED");

    if (!VALID_PRODUCT_STATUSES.includes(normalizedStatus)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PRODUCT_STATUS",
      });
    }

    // Resolve merchant branding from the authenticated user.
    const displayBrandName =
      (typeof brandName === "string" && brandName.trim()) ||
      req.user.brandName ||
      req.user.displayName ||
      "SokoDigi Merchant";

    const product = await Product.create({
      productCode: generateProductCode(),

      sellerId: req.user._id,
      merchantId: req.user._id,

      name: name.trim(),
      brandName: displayBrandName,

      category:
        typeof category === "string" && category.trim()
          ? category.trim().toLowerCase()
          : "general",

      subCategory:
        typeof subCategory === "string"
          ? subCategory.trim().toLowerCase()
          : "",

      price: numericPrice,
      affiliateCommission: numericCommission,

      wholesalePrice: numericPrice - numericCommission,
      resellerWholesaleCost: numericPrice - numericCommission,

      quantity: numericQuantity,
      deliveryFee: numericDeliveryFee,

      description:
        typeof description === "string"
          ? description.trim()
          : "",

      status: normalizedStatus,
      isShelved: normalizedStatus === "LISTED",
      imageUrl:
        typeof imageUrl === "string" ? imageUrl.trim() : "",

      metrics: {
        conversionRate: 0,
        referralCount: 0,
        escrowDisputeRate: 0,
      },
    });

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
// 5. UPDATE A PRODUCT
// =========================================================================

async function updateProduct(req, res) {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        ok: false,
        error: "AUTHENTICATION_REQUIRED",
      });
    }

    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PRODUCT_ID",
      });
    }

    const product = await Product.findOne({
      _id: id,
      sellerId: req.user._id,
    });

    if (!product) {
      return res.status(404).json({
        ok: false,
        error: "PRODUCT_NOT_FOUND",
      });
    }

    const body = req.body;

    // Only allow explicitly supported fields to be changed.
    const stringFields = [
      "name",
      "category",
      "subCategory",
      "description",
      "imageUrl",
      "brandName",
    ];

    for (const field of stringFields) {
      if (body[field] !== undefined) {
        if (typeof body[field] !== "string") {
          return res.status(400).json({
            ok: false,
            error: `INVALID_${field.toUpperCase()}`,
          });
        }

        product[field] = [
          "category",
          "subCategory",
        ].includes(field)
          ? body[field].trim().toLowerCase()
          : body[field].trim();
      }
    }

    if (body.status !== undefined) {
      const nextStatus = normalizeStatus(body.status);

      if (!VALID_PRODUCT_STATUSES.includes(nextStatus)) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_PRODUCT_STATUS",
        });
      }

      product.status = nextStatus;

      if (nextStatus === "UNLISTED") {
        product.isShelved = false;
      } else if (nextStatus === "LISTED") {
        product.isShelved = true;
      }
    }

    const numericFields = [
      "price",
      "quantity",
      "deliveryFee",
      "affiliateCommission",
    ];

    for (const field of numericFields) {
      if (body[field] !== undefined) {
        if (body[field] === "" || body[field] === null) {
          return res.status(400).json({
            ok: false,
            error: `INVALID_${field.toUpperCase()}`,
          });
        }

        const value = Number(body[field]);

        if (!Number.isFinite(value) || value < 0) {
          return res.status(400).json({
            ok: false,
            error: `INVALID_${field.toUpperCase()}`,
          });
        }

        if (field === "quantity" && !Number.isInteger(value)) {
          return res.status(400).json({
            ok: false,
            error: "INVALID_PRODUCT_QUANTITY",
          });
        }

        product[field] = value;
      }
    }

    if (product.price <= 0) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PRODUCT_PRICE",
      });
    }

    if (product.affiliateCommission >= product.price) {
      return res.status(400).json({
        ok: false,
        error: "COMMISSION_CANNOT_EQUAL_OR_EXCEED_PRICE",
      });
    }

    // Keep reseller costs synchronized with the current commission.
    product.wholesalePrice =
      product.price - product.affiliateCommission;

    product.resellerWholesaleCost =
      product.price - product.affiliateCommission;

    await product.save();

    return res.status(200).json({
      ok: true,
      message: "Product updated successfully.",
      product,
    });
  } catch (error) {
    return sendServerError(res, error, "Update product");
  }
}

// =========================================================================
// 6. DELETE A PRODUCT
// =========================================================================

async function deleteProduct(req, res) {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        ok: false,
        error: "AUTHENTICATION_REQUIRED",
      });
    }

    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PRODUCT_ID",
      });
    }

    const deletedProduct = await Product.findOneAndDelete({
      _id: id,
      sellerId: req.user._id,
    });

    if (!deletedProduct) {
      return res.status(404).json({
        ok: false,
        error: "PRODUCT_NOT_FOUND",
      });
    }

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
// 7. UPDATE PRODUCT STATUS
// =========================================================================

async function updateProductStatus(req, res) {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        ok: false,
        error: "AUTHENTICATION_REQUIRED",
      });
    }

    const { id } = req.params;
    const { status } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PRODUCT_ID",
      });
    }

    if (!VALID_PRODUCT_STATUSES.includes(status)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PRODUCT_STATUS",
        message: "Allowed statuses are LISTED, ACTIVE, and UNLISTED.",
      });
    }

    const normalizedStatus = normalizeStatus(status);

    const product = await Product.findOneAndUpdate(
      {
        _id: id,
        sellerId: req.user._id,
      },
      {
        $set: {
          status: normalizedStatus,
          isShelved: normalizedStatus === "LISTED",
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!product) {
      return res.status(404).json({
        ok: false,
        error: "PRODUCT_NOT_FOUND",
      });
    }

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
// 8. TOGGLE PRODUCT SHELF
// Compatible with PATCH /api/products/:id/toggle-shelf
// =========================================================================

async function toggleProductShelf(req, res) {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        ok: false,
        error: "AUTHENTICATION_REQUIRED",
      });
    }

    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PRODUCT_ID",
      });
    }

    const product = await Product.findOne({
      _id: id,
      sellerId: req.user._id,
    });

    if (!product) {
      return res.status(404).json({
        ok: false,
        error: "PRODUCT_NOT_FOUND",
      });
    }

    const currentlyShelved =
      product.isShelved === true &&
      product.status !== "UNLISTED";

    const shouldShelve = !currentlyShelved;

    product.isShelved = shouldShelve;
    product.status = shouldShelve ? "LISTED" : "UNLISTED";

    await product.save();

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
    const userCategory = getUserCategory(req);
    const type = req.query.type || "trending";

    const requestedLimit = Number(req.query.limit ?? 8);

    if (
      !Number.isInteger(requestedLimit) ||
      requestedLimit < 1
    ) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_LIMIT",
      });
    }

    const limit = Math.min(requestedLimit, 50);

    const queryFilter = {
      isShelved: true,
      status: "LISTED",
      quantity: { $gt: 0 },
    };

    let sortCriteria = {
      createdAt: -1,
    };

    switch (type) {
      case "best-sellers":
        queryFilter["metrics.conversionRate"] = {
          $gte: 0.12,
        };

        sortCriteria = {
          "metrics.conversionRate": -1,
          "metrics.referralCount": -1,
          createdAt: -1,
        };
        break;

      case "top-products":
        queryFilter.isPremiumVendor = true;
        queryFilter["metrics.escrowDisputeRate"] = {
          $lt: 0.03,
        };

        sortCriteria = {
          "metrics.referralCount": -1,
          createdAt: -1,
        };
        break;

      case "fresh-drops": {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        queryFilter.createdAt = {
          $gte: oneWeekAgo,
        };

        sortCriteria = {
          createdAt: -1,
        };
        break;
      }

      case "trending":
      default:
        sortCriteria = {
          "metrics.referralCount": -1,
          createdAt: -1,
        };
        break;
    }

    let products = await Product.find(queryFilter)
      .sort(sortCriteria)
      .limit(limit)
      .lean();

    if (userCategory !== "network") {
      products = products.map(redactPrivateProductFields);
    }

    return res.status(200).json({
      ok: true,
      smartCategory: type,
      count: products.length,
      feed: products,
    });
  } catch (error) {
    return sendServerError(res, error, "Smart product discoveries");
  }
}

// =========================================================================
// 10. SHARE PRODUCT
// Provides a product URL; affiliate attribution must be implemented separately.
// =========================================================================

async function shareProduct(req, res) {
  try {
    const productId = req.body.productId || req.params.id;

    if (!productId || !isValidId(productId)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PRODUCT_ID",
      });
    }

    const product = await Product.findById(productId)
      .select("_id name status isShelved")
      .lean();

    if (
      !product ||
      product.status === "UNLISTED" ||
      product.isShelved === false
    ) {
      return res.status(404).json({
        ok: false,
        error: "PRODUCT_NOT_AVAILABLE_FOR_SHARING",
      });
    }

    const frontendUrl = (
      process.env.FRONTEND_URL || "http://localhost:5173"
    ).replace(/\/$/, "");

    const shareUrl =
      `${frontendUrl}/product/${product._id}`;

    return res.status(200).json({
      ok: true,
      message: "Product share link generated successfully.",
      productId: String(product._id),
      productName: product.name,
      shareUrl,
    });
  } catch (error) {
    return sendServerError(res, error, "Share product");
  }
}

// =========================================================================
// 11. PERMANENTLY PURGE PRODUCT
// Use only if this operation is intentionally exposed by your routes.
// =========================================================================

async function purgeProductAsset(req, res) {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        ok: false,
        error: "AUTHENTICATION_REQUIRED",
      });
    }

    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PRODUCT_ID",
      });
    }

    const product = await Product.findOneAndDelete({
      _id: id,
      sellerId: req.user._id,
    });

    if (!product) {
      return res.status(404).json({
        ok: false,
        error: "PRODUCT_NOT_FOUND",
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Product permanently deleted.",
      purgedAssetId: String(product._id),
    });
  } catch (error) {
    return sendServerError(res, error, "Purge product");
  }
}

// =========================================================================
// EXPORTS
// =========================================================================

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
};
