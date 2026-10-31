const crypto = require("crypto");
const ApiKey = require("../models/ApiKey");
const User = require("../models/User");
const { entitlementsFor } = require("../modules/membership/entitlements");

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
module.exports = async (req, res, next) => {
  try {
    const m = /^Bearer (sk_live_[A-Za-z0-9_-]{20,64})$/.exec(req.get("authorization") || "");
    if (!m) return res.status(401).json({ error: "API_KEY_REQUIRED" });
    const k = await ApiKey.findOne({ hash: sha(m[1]), revokedAt: null }).lean();
    if (!k) return res.status(401).json({ error: "API_KEY_INVALID" });
    const owner = await User.findById(k.ownerId).select("accountCategory membershipStatus membershipExpiresAt plan isActive").lean();
    if (!owner || !owner.isActive || owner.membershipStatus === "suspended") return res.status(403).json({ error: "ACCOUNT_UNAVAILABLE" });
    const ent = entitlementsFor(owner);
    if (!ent.active || !ent.features.apiAccess) return res.status(403).json({ error: "PLAN_UPGRADE_REQUIRED" });
    if (!k.lastUsedAt || Date.now() - k.lastUsedAt > 60000) ApiKey.updateOne({ _id: k._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
    req.apiOwnerId = k.ownerId; req.apiKeyId = k._id;
    next();
  } catch (e) { console.error("❌ api key:", e.message); res.status(500).json({ error: "INTERNAL_SERVER_ERROR" }); }
};
module.exports.sha = sha;
