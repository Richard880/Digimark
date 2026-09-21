const User = require("../../models/User");
const Product = require("../../models/Product");

// 🎯 THE RESOLUTION FIX: Verify your casing matches your GitHub file tree exactly!
// If your file is lowercase u on git, change this string to "../../models/userProfile"
const UserProfile = require("../../models/UserProfile"); 

/**
 * GET /api/profiles/:username
 * Safely fetches public storefront catalogs without breaking on unhandled exceptions
 */
async function getPublicProfile(req, res) {
  try {
    const usernameParam = req.params.username || "";
    
    const profile = await UserProfile.findOne({
      username: usernameParam.toLowerCase().trim(),
      publicProfile: true,
    }).lean();

    if (!profile) {
      return res.status(404).json({ error: "PUBLIC_PROFILE_NOT_FOUND" });
    }

    const user = await User.findById(profile.userId)
      .select("role accountType membershipStatus isActive")
      .lean();

    if (!user || !user.isActive) {
      return res.status(404).json({ error: "PUBLIC_PROFILE_NOT_FOUND" });
    }

    const products = await Product.find({ sellerId: user._id, status: "LISTED" })
      .select("productCode name brandName category price quantity deliveryFee description imageUrl likesCount createdAt")
      .sort({ createdAt: -1 })
      .lean();

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
        accountType: user.accountType,
        membershipStatus: user.membershipStatus,
        stats: { products: products.length },
      },
      products: products || [],
    });

  } catch (error) {
    console.error("❌ Exception inside getPublicProfile handler loop:", error.message);
    return res.status(500).json({ 
      error: "INTERNAL_SERVER_ERROR", 
      message: error.message 
    });
  }
}

module.exports = { getPublicProfile };
