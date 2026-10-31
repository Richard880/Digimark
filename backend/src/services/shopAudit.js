const ShopAudit = require("../models/ShopAudit");
const audit = (req, action, { branchId, targetType, targetId, detail } = {}) =>
  ShopAudit.create({ ownerId: req.shop.ownerId, actorId: req.user._id, actorName: req.shop.memberName, role: req.shop.role, action,
    branchId: branchId || undefined, targetType, targetId: targetId ? String(targetId) : undefined, detail: String(detail || "").slice(0, 200) })
    .catch((e) => console.error("❌ audit write failed:", e.message));
module.exports = { audit };
