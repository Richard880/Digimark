const User = require("../../models/User");
const UserProfile = require("../../models/UserProfile");
const Product = require("../../models/Product");

async function getPublicProfile(req, res) {
  const profile = await UserProfile.findOne({
    username: req.params.username.toLowerCase(),
    publicProfile: true,
  }).lean();

  if (!profile) return res.status(404).json({ error: "PUBLIC_PROFILE_NOT_FOUND" });

  const user = await User.findById(profile.userId).select("role accountType membershipStatus isActive").lean();
  if (!user || !user.isActive) return res.status(404).json({ error: "PUBLIC_PROFILE_NOT_FOUND" });

  const products = await Product.find({ sellerId: user._id, status: "LISTED" })
    .select("productCode name brandName category price quantity deliveryFee description imageUrl likesCount createdAt")
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    profile: {
      username: profile.username,
      displayName: profile.displayName,
      brandName: profile.brandName,
      bio: profile.bio,
      profilePhoto: profile.profilePhoto,
      coverPhoto: profile.coverPhoto,
      location: profile.location,
      marketerLevel: profile.marketerLevel,
      accountType: user.accountType,
      membershipStatus: user.membershipStatus,
      stats: { products: products.length },
    },
    products,
  });
}

module.exports = { getPublicProfile };
