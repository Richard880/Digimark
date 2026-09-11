const express = require("express");

const router = express.Router();
router.use("/auth", require("../modules/auth/auth.routes"));
router.use("/profiles", require("../modules/profiles/profile.routes"));
router.use("/products", require("../modules/products/product.routes"));

module.exports = router;
