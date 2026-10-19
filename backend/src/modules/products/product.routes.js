const express = require("express");
const rateLimit = require("express-rate-limit");
const authenticate = require("../../middleware/authenticate");

const {
  listProducts, getPublicStoreProducts, getProductById, createProduct, updateProduct,
  updateProductStatus, purgeProductAsset, shareProduct, toggleProductShelf,
  getSmartDiscoveries, getHeroBannerFeed, getSharedProducts,
} = require("./product.controller");

const router = express.Router();

const perUser = (limit) =>
  rateLimit({ windowMs: 60 * 1000, limit, keyGenerator: (req) => String(req.user._id), message: { error: "TOO_MANY_REQUESTS" } });
const perIp = (limit) => rateLimit({ windowMs: 60 * 1000, limit, message: { error: "TOO_MANY_REQUESTS" } });

// Order matters: fixed paths FIRST, then /:id last, or "/:id" swallows them.

/* Public reads. Optional login: signed-in users get commission data (marketers) and their own unlisted stock (owners). */
router.get("/", perIp(120), authenticate.optional, listProducts);
router.get("/public-store", perIp(120), authenticate.optional, getPublicStoreProducts);
router.get("/discovery", perIp(120), authenticate.optional, getSmartDiscoveries);
router.get("/hero-banner", perIp(120), getHeroBannerFeed);
router.get("/shared", perIp(120), authenticate.optional, getSharedProducts);

/* Marketer actions (the controllers enforce "active marketer" themselves) */
router.post("/", authenticate, perUser(20), createProduct);
router.post("/share", authenticate, perUser(30), shareProduct);
router.post("/:id/share", authenticate, perUser(30), shareProduct);
router.patch("/:id/toggle-shelf", authenticate, perUser(60), toggleProductShelf);
router.patch("/:id/status", authenticate, perUser(60), updateProductStatus);

/* Single product (wildcard last) */
router.get("/:id", perIp(120), authenticate.optional, getProductById);
router.put("/:id", authenticate, perUser(30), updateProduct);
router.patch("/:id", authenticate, perUser(30), updateProduct);
router.delete("/:id", authenticate, perUser(20), purgeProductAsset);

module.exports = router;
