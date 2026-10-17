const express = require("express");
const router = express.Router();

router.use("/auth", require("../modules/auth/auth.routes"));
router.use("/profiles", require("../modules/profiles/profile.routes"));
router.use("/products", require("../modules/products/product.routes"));
router.use("/upload", require("./upload.routes"));
router.use("/network", require("../../api/network.routes"));
router.use("/notifications", require("./notification.routes"));
router.use("/orders", require("../modules/order/order.routes"));
router.use("/wallet", require("../modules/wallet/wallet.routes"));
router.use("/membership", require("../modules/membership/membership.routes"));

module.exports = router;
