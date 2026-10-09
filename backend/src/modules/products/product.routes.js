const express = require("express");
const authenticate = require("../../middleware/authenticate"); // Parses token data variables
const authorize = require("../../middleware/authorize");       // Verifies category rights

const { 
  listProducts,
  getPublicStoreProducts, // 🎯 Included public catalog feed stream handler
  getProductById,
  createProduct, 
  updateProduct, 
  updateProductStatus,    // 🎯 NEW: Imported status toggle controller
  purgeProductAsset,      // 🎯 NEW: Imported permanent asset purge controller
  shareProduct,       
  toggleProductShelf,
  getSmartDiscoveries 
} = require("./product.controller");

const router = express.Router();

// =========================================================================
// 🎯 CRITICAL: Route ordering matters! Express matches routes in order.
// 
// Rules:
// 1. Static paths FIRST (e.g., /public-store, /discovery, /share)
// 2. Parameterized specific paths SECOND (e.g., /:id/toggle-shelf, /:id/status)
// 3. Generic wildcard paths LAST (e.g., /:id)
// 
// If wildcard /:id comes before /:id/toggle-shelf, Express will match
// /:id first and never reach the more specific route!
// =========================================================================

// =========================================================================
// 🛒 1. PUBLIC READ-ONLY ENDPOINTS (Static paths, no auth required)
// =========================================================================

// GET /api/products
// List products - filters by sellerId and status based on query params
router.get("/", listProducts);

// GET /api/products/public-store
// Public storefront products (no auth required)
router.get("/public-store", getPublicStoreProducts);

// GET /api/products/discovery
// Smart discovery feeds (trending, best-sellers, fresh-drops, top-products)
router.get("/discovery", getSmartDiscoveries);


// =========================================================================
// 📤 2. PUBLIC WRITE ENDPOINTS (Static paths with specific action)
// =========================================================================

// POST /api/products/share
// Generate shareable product link (requires auth)
router.post("/share", authenticate, shareProduct);


// =========================================================================
// 🔒 3. VENDOR-ONLY ENDPOINTS (Requires "network" authorization)
// =========================================================================

// POST /api/products
// Create new product (requires auth + network role)
router.post("/", authenticate, authorize("network"), createProduct);


// =========================================================================
// ⚠️ CRITICAL SECTION: PARAMETERIZED PATHS BEFORE WILDCARD
// 
// These MUST come BEFORE the wildcard /:id routes!
// Otherwise /:id will match first and these specific paths won't work.
// =========================================================================

// PATCH /api/products/:id/toggle-shelf
// Toggle product visibility on/off shelf (requires auth + network role)
router.patch("/:id/toggle-shelf", authenticate, authorize("network"), toggleProductShelf);

// PATCH /api/products/:id/status
// Update product status (LISTED/UNLISTED/ACTIVE) (requires auth + network role)
// 🎯 This is the endpoint used by the dashboard to show/hide products
router.patch("/:id/status", authenticate, authorize("network"), updateProductStatus);


// =========================================================================
// 🔍 4. GENERIC WILDCARD ENDPOINTS (Must always sit at the bottom!)
// =========================================================================

// GET /api/products/:id
// Get single product by ID (public read, no auth required)
router.get("/:id", getProductById);

// PUT /api/products/:id
// Update product fields (requires auth + network role)
router.put("/:id", authenticate, authorize("network"), updateProduct);

// DELETE /api/products/:id
// Delete product permanently (requires auth + network role)
router.delete("/:id", authenticate, authorize("network"), purgeProductAsset);

module.exports = router;
