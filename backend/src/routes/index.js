const express = require("express");
const router = express.Router();

router.use("/auth", require("../modules/auth/auth.routes"));
router.use("/profiles", require("../modules/profiles/profile.routes"));

router.use("/products", require("../modules/products/product.routes"));
router.use("/inventory", require("../modules/inventory/inventory.routes"));

router.use("/upload", require("./upload.routes"));
router.use("/network", require("../modules/network/network.routes"));
router.use("/notifications", require("./notification.routes"));

router.use("/orders", require("../modules/order/order.routes"));
router.use("/wallet", require("../modules/wallet/wallet.routes"));

router.use("/membership", require("../modules/membership/membership.routes"));
router.use("/internal", require("./internal.routes"));
router.use("/search", require("./search.routes"));
router.use("/chats", require("../modules/chats/chat.routes"));

router.use("/branches", require("../modules/branch/branch.routes"));
router.use("/staff", require("../modules/staff/staff.routes"));
router.use("/terminals", require("../modules/terminal/terminal.routes"));
router.use("/pos", require("../modules/pos/pos.routes"));
router.use("/customers", require("../modules/customers/customers.routes"));
router.use("/supply", require("../modules/supply/supply.routes"));

router.use("/disputes", require("../modules/disputes/dispute.routes"));

router.use("/onboarding", require("../modules/onboarding/onboarding.routes"));
router.use("/push", require("../modules/push/push.routes"));

router.use("/admin", require("../modules/admin/admin.routes"));

module.exports = router;
