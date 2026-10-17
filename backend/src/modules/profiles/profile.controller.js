const mongoose = require("mongoose");
const User = require("../../models/User");
const Product = require("../../models/Product");
const UserProfile = require("../../models/UserProfile");


const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const VISIBLE = { status: { $in: ["LISTED", "ACTIVE"] }, isShelved: true, quantity: { $gt: 0 } };

/**
 * GET /api/profiles/:username  (public, no login needed)
 * Only ACTIVE, paid network members have a public shop.
 */
async function getPublicProfile(req, res) {
  try {
    const username = String(req.params.username || "").toLowerCase().trim();
    if (!USERNAME_RE.test(username)) return res.status(404).json({ error: "PUBLIC_PROFILE_NOT_FOUND" });

    const profile = await UserProfile.findOne({ username, publicProfile: true }).lean();
    if (!profile) return res.status(404).json({ error: "PUBLIC_PROFILE_NOT_FOUND" });

    const user = await User.findById(profile.userId)
      .select("accountCategory membershipStatus membershipExpiresAt isActive")
      .lean();

    const shopIsLive =
      user &&
      user.isActive &&
      user.accountCategory === "network" &&
      user.membershipStatus === "active" &&
      (!user.membershipExpiresAt || user.membershipExpiresAt > new Date());
    if (!shopIsLive) return res.status(404).json({ error: "PUBLIC_PROFILE_NOT_FOUND" }); // same answer for every case

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const filter = { sellerId: user._id, ...VISIBLE };

    const [products, total] = await Promise.all([
      Product.find(filter)
        .select("productCode name brandName category price quantity deliveryFee description imageUrl likesCount createdAt")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    res.set("Cache-Control", "public, max-age=60"); // public page: lets browsers and CDNs absorb repeat visits
    return res.json({
      profile: {
        username: profile.username,
        displayName: profile.displayName,
        brandName: profile.brandName,
        bio: profile.bio,
        profilePhoto: profile.profilePhoto || profile.photoURL || profile.profilePic || "",
        coverPhoto: profile.coverPhoto || "",
        location: profile.location || { county: "", country: "Kenya" },
        marketerLevel: profile.marketerLevel || "starter",
        stats: { products: total },
      },
      page,
      products,
    });
  } catch (error) {
    console.error("❌ getPublicProfile:", error.stack || error.message); // log it, never send it
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}



const isId = (v) => typeof v === "string" && mongoose.isValidObjectId(v);

// POST /api/profiles/me/featured   body: { productId }
async function featureProduct(req, res) {
  try {
    const { productId } = req.body || {};
    if (!isId(productId)) return res.status(400).json({ error: "INVALID_PRODUCT_ID" });

    // Only the seller's own, listed products can be featured
    const owned = await Product.exists({
      _id: productId, sellerId: req.user._id,
      status: { $in: ["LISTED", "ACTIVE"] }, isShelved: true,
    });
    if (!owned) return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });

    // The "slot 5 is empty" check and the add happen in ONE atomic step
    const r = await UserProfile.updateOne(
      { userId: req.user._id, "featuredProducts.4": { $exists: false } },
      { $addToSet: { featuredProducts: productId } }
    );
    if (r.matchedCount === 0) {
      const already = await UserProfile.exists({ userId: req.user._id, featuredProducts: productId });
      if (already) return res.json({ ok: true });
      return res.status(409).json({ error: "FEATURED_LIMIT_REACHED", max: 5 });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error("❌ featureProduct:", e.stack || e.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// DELETE /api/profiles/me/featured/:productId
async function unfeatureProduct(req, res) {
  try {
    if (!isId(req.params.productId)) return res.status(400).json({ error: "INVALID_PRODUCT_ID" });
    await UserProfile.updateOne({ userId: req.user._id }, { $pull: { featuredProducts: req.params.productId } });
    return res.json({ ok: true });
  } catch (e) {
    console.error("❌ unfeatureProduct:", e.stack || e.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

module.exports = { getPublicProfile, unfeatureProduct, featureProduct };
