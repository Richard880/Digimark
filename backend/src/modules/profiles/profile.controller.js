const mongoose = require("mongoose");
const User = require("../../models/User");
const Product = require("../../models/Product");
const UserProfile = require("../../models/UserProfile");
const { assertCanChange } = require("../../utils/profileLock");
const Order = require("../../models/Order");
const { notify } = require("../../services/notification.service");

// =========================================================================
// HELPERS
// =========================================================================
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const VISIBLE = {
  status: { $in: ["LISTED", "ACTIVE"] },
  isShelved: true,
  quantity: { $gt: 0 },
};

const isId = (v) => typeof v === "string" && mongoose.isValidObjectId(v);
const text = (v, min, max) => {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  return s.length >= min && s.length <= max ? s : null;
};
const normalizePhone = (raw) => {
  const p = String(raw || "").replace(/[\s+-]/g, "");
  if (/^0[17]\d{8}$/.test(p)) return "254" + p.slice(1);
  return /^254[17]\d{8}$/.test(p) ? p : null;
};

// Photos must be images from YOUR Cloudinary profiles folder
function cleanProfileImage(v) {
  if (v === "") return "";
  try {
    const u = new URL(v);
    const cloud = (process.env.CLOUDINARY_CLOUD_NAME || "").replace(
      /[^\w-]/g,
      ""
    );
    const re = new RegExp(
      `^/${cloud}/image/upload/(v\\d+/)?sokodigi/profiles/[\\w-]{1,80}\\.(jpg|jpeg|png|webp)$`
    );
    return u.protocol === "https:" &&
      u.hostname === "res.cloudinary.com" &&
      cloud &&
      re.test(u.pathname)
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}

const fail = (res, error, status = 400, extra = {}) =>
  res.status(status).json({ error, ...extra });

const serverError = (res, tag, e) => {
  console.error(`❌ ${tag}:`, e.stack || e.message);
  return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
};

// =========================================================================
// GET /api/profiles/:username (public, no login needed)
// Only ACTIVE, paid network members have a public shop.
// =========================================================================
async function getPublicProfile(req, res) {
  try {
    const username = String(req.params.username || "").toLowerCase().trim();
    if (!USERNAME_RE.test(username)) {
      return fail(res, "PUBLIC_PROFILE_NOT_FOUND", 404);
    }

    const profile = await UserProfile.findOne({
      username,
      publicProfile: true,
    }).lean();
    if (!profile) return fail(res, "PUBLIC_PROFILE_NOT_FOUND", 404);

    const user = await User.findById(profile.userId)
      .select("accountCategory membershipStatus membershipExpiresAt isActive")
      .lean();

    const shopIsLive =
      user &&
      user.isActive &&
      user.accountCategory === "network" &&
      user.membershipStatus === "active" &&
      (!user.membershipExpiresAt || user.membershipExpiresAt > new Date());

    if (!shopIsLive) return fail(res, "PUBLIC_PROFILE_NOT_FOUND", 404);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const filter = { sellerId: user._id, ...VISIBLE };

    const [products, total, featured] = await Promise.all([
      Product.find(filter)
        .select(
          "productCode name brandName category price quantity deliveryFee description imageUrl likesCount createdAt"
        )
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
      profile.featuredProducts?.length
        ? Product.find({
            _id: { $in: profile.featuredProducts },
            sellerId: user._id,
            ...VISIBLE,
          })
            .select("productCode name brandName price imageUrl")
            .lean()
        : [],
    ]);

    res.set("Cache-Control", "public, max-age=60");
    return res.json({
      profile: {
        username: profile.username,
        displayName: profile.displayName,
        brandName: profile.brandName,
        bio: profile.bio,
        profilePhoto: profile.profilePhoto || "",
        coverPhoto: profile.coverPhoto || "",
        location: {
          county: profile.location?.county || "",
          country: profile.location?.country || "Kenya",
        },
        marketerLevel: profile.marketerLevel || "starter",
        stats: { products: total },
      },
      featured,
      page,
      products,
    });
  } catch (e) {
    return serverError(res, "getPublicProfile", e);
  }
}

// =========================================================================
// GET /api/profiles/me: owner sees private fields
// =========================================================================
async function getMyProfile(req, res) {
  try {
    const profile = await UserProfile.findOne({ userId: req.user._id }).lean();
    if (!profile) return fail(res, "PROFILE_NOT_FOUND", 404);

    const { userId, ...rest } = profile;
    return res.json({ ok: true, profile: rest });
  } catch (e) {
    return serverError(res, "getMyProfile", e);
  }
}

// =========================================================================
// PATCH /api/profiles/me: whitelist only
// =========================================================================
async function updateMyProfile(req, res) {
  try {
    const b =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : {};
    const set = {};
    const has = (k) => b[k] !== undefined;

    const filter = { userId: req.user._id };
    const profile = await UserProfile.findOne(filter).lean();

    if (!profile) return fail(res, "PROFILE_NOT_FOUND", 404);

    let stamp;
    try {
      stamp = assertCanChange(profile, b);
    } catch (e) {
      if (e?.message === "PROFILE_LOCKED") {
        return res
          .status(409)
          .json({ error: "PROFILE_LOCKED", until: e.until });
      }
      throw e;
    }

    for (const [k, min, max] of [
      ["firstName", 1, 50],
      ["lastName", 1, 50],
      ["displayName", 1, 100],
      ["brandName", 2, 60],
      ["brandCategory", 2, 40],
      ["address", 5, 200],
    ]) {
      if (!has(k)) continue;
      const v = text(b[k], min, max);
      if (!v) return fail(res, "VALIDATION_ERROR", 400, { field: k });
      set[k] = v;
    }

    if (has("bio")) {
      if (typeof b.bio !== "string" || b.bio.trim().length > 500) {
        return fail(res, "VALIDATION_ERROR", 400, { field: "bio" });
      }
      set.bio = b.bio.trim();
    }

    if (b.location && typeof b.location === "object") {
      for (const k of ["county", "subCounty"]) {
        if (b.location[k] === undefined) continue;
        const v = text(b.location[k], 2, 40);
        if (!v) {
          return fail(res, "VALIDATION_ERROR", 400, {
            field: `location.${k}`,
          });
        }
        set[`location.${k}`] = v;
      }
    }

    for (const k of ["profilePhoto", "coverPhoto"]) {
      if (!has(k)) continue;
      const u = typeof b[k] === "string" ? cleanProfileImage(b[k]) : null;
      if (u === null) return fail(res, "INVALID_IMAGE_URL", 400, { field: k });
      set[k] = u;
    }

    if (has("publicProfile")) {
      if (typeof b.publicProfile !== "boolean") {
        return fail(res, "VALIDATION_ERROR", 400, { field: "publicProfile" });
      }
      set.publicProfile = b.publicProfile;
    }

    // Intentionally not editable here:
    // marketerLevel, kycStatus, membershipNumber, userId, featuredProducts.

    // Username can be chosen once; changing it would break shared links.
    if (has("username")) {
      const u =
        typeof b.username === "string" ? b.username.trim().toLowerCase() : "";
      if (!USERNAME_RE.test(u)) {
        return fail(res, "VALIDATION_ERROR", 400, { field: "username" });
      }

      const r = await UserProfile.updateOne(
        {
          ...filter,
          $or: [
            { username: { $exists: false } },
            { username: null },
            { username: "" },
          ],
        },
        { $set: { username: u } },
        { runValidators: true }
      );

      if (r.matchedCount === 0) {
        const same = await UserProfile.exists({ ...filter, username: u });
        if (!same) return fail(res, "USERNAME_CHANGE_NOT_ALLOWED", 409);
      }
    }

    // Payout phone can be set once; changing it needs a verified flow.
    if (has("phoneNumber")) {
      const p = normalizePhone(b.phoneNumber);
      if (!p) {
        return fail(res, "VALIDATION_ERROR", 400, { field: "phoneNumber" });
      }

      const r = await UserProfile.updateOne(
        {
          ...filter,
          $or: [
            { phoneNumber: "" },
            { phoneNumber: { $exists: false } },
          ],
        },
        { $set: { phoneNumber: p } },
        { runValidators: true }
      );

      if (r.matchedCount === 0) {
        const same = await UserProfile.exists({ ...filter, phoneNumber: p });
        if (!same) return fail(res, "PHONE_CHANGE_NOT_ALLOWED", 409);
      }
    }

    if (stamp) set.identityChangedAt = new Date();

    const rebranded = typeof set.brandName === "string" && set.brandName !== profile.brandName;
    if (rebranded) { set.previousBrandName = profile.brandName || ""; set.rebrandedAt = new Date(); }

    if (Object.keys(set).length) {
      await UserProfile.updateOne(filter, { $set: set }, { runValidators: true });

            if (rebranded && profile.username) {
        try {
          const rows = await Order.aggregate([
            { $match: { sellerId: req.user._id, createdAt: { $gte: new Date(Date.now() - 365 * 86400000) } } },
            { $sort: { createdAt: -1 } },
            { $group: { _id: "$buyerId" } },
            { $limit: 500 },
          ]);
          if (rows.length) await notify("SHOP_RENAMED", rows.map((r) => r._id), { oldName: profile.brandName || "A shop", newName: set.brandName, username: profile.username }, { actorId: req.user._id });
        } catch (err) { console.error("❌ rebrand notice:", err.message); } // never fail the save because of this
      }
    }

    const updatedProfile = await UserProfile.findOne(filter).lean();
    if (!updatedProfile) return fail(res, "PROFILE_NOT_FOUND", 404);

    const { userId, ...rest } = updatedProfile;
    return res.json({ ok: true, profile: rest });
  } catch (e) {
    if (e && e.code === 11000) {
      const field = Object.keys(e.keyPattern || {})[0];
      return fail(
        res,
        field === "username" ? "USERNAME_TAKEN" : "ACCOUNT_DETAILS_IN_USE",
        409
      );
    }
    return serverError(res, "updateMyProfile", e);
  }
}

// =========================================================================
// POST /api/profiles/me/featured { productId } (max 5, atomic)
// =========================================================================
async function featureProduct(req, res) {
  try {
    if (req.userCategory !== "network") {
      return fail(res, "MARKETER_ACCOUNT_REQUIRED", 403);
    }

    const { productId } = req.body || {};
    if (!isId(productId)) return fail(res, "INVALID_PRODUCT_ID");

    const owned = await Product.exists({
      _id: productId,
      sellerId: req.user._id,
      status: { $in: ["LISTED", "ACTIVE"] },
      isShelved: true,
    });
    if (!owned) return fail(res, "PRODUCT_NOT_FOUND", 404);

    const r = await UserProfile.updateOne(
      { userId: req.user._id, "featuredProducts.4": { $exists: false } },
      { $addToSet: { featuredProducts: productId } }
    );

    if (r.matchedCount === 0) {
      if (
        await UserProfile.exists({
          userId: req.user._id,
          featuredProducts: productId,
        })
      ) {
        return res.json({ ok: true });
      }
      return fail(res, "FEATURED_LIMIT_REACHED", 409, { max: 5 });
    }

    return res.json({ ok: true });
  } catch (e) {
    return serverError(res, "featureProduct", e);
  }
}

// DELETE /api/profiles/me/featured/:productId
async function unfeatureProduct(req, res) {
  try {
    if (!isId(req.params.productId)) return fail(res, "INVALID_PRODUCT_ID");

    await UserProfile.updateOne(
      { userId: req.user._id },
      { $pull: { featuredProducts: req.params.productId } }
    );

    return res.json({ ok: true });
  } catch (e) {
    return serverError(res, "unfeatureProduct", e);
  }
}

module.exports = {
  getPublicProfile,
  getMyProfile,
  updateMyProfile,
  featureProduct,
  unfeatureProduct,
};
