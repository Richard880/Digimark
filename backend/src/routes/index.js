const express = require("express");

const router = express.Router();
router.use("/auth", require("../modules/auth/auth.routes"));
router.use("/profiles", require("../modules/profiles/profile.routes"));
router.use("/products", require("../modules/products/product.routes"));
router.use("/upload",require("./upload.routes"));
router.use("/network",require("../../api/network.routes")); // Adjust path to network.routes.js
router.use("/orders", require("../modules/order/order.routes")); 

module.exports = router;
