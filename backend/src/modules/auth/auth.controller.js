const { synchronizeFirebaseUser, upgradeToNetwork } = require("./auth.service");
const admin = require("../../config/firebaseAdmin");
const User = require("../../models/User");
const UserProfile = require("../../models/UserProfile");

// Adjust to the values your app really uses
const ACCOUNT_CATEGORIES = ["retail", "network"];
const DEFAULT_CATEGORY = "retail";
// Marketers earn payouts, so require a verified email. Set to false only if you use phone-only login.
const REQUIRE_VERIFIED_EMAIL_FOR_NETWORK = true;

const present = (v) => v !== undefined && v !== null && v !== "";
const NAME_RE = /^[\p{L}][\p{L}\p{M}' -]*$/u;

const clean = (v, min, max) => {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  return s.length >= min && s.length <= max ? s : null;
};

function normalizePhone(raw) {
  const p = String(raw || "").replace(/[\s+-]/g, "");
  if (/^0[17]\d{8}$/.test(p)) return "254" + p.slice(1);
  if (/^254[17]\d{8}$/.test(p)) return p;
  return null;
}

function cleanUrl(v) {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && v.length <= 500 ? u.toString() : null;
  } catch {
    return null;
  }
}

class InputError extends Error {
  constructor(field) {
    super("VALIDATION_ERROR");
    this.field = field;
  }
}

function sendError(res, err) {
  if (err instanceof InputError) {
    return res.status(400).json({ error: "VALIDATION_ERROR", field: err.field });
  }
  // Duplicate key (username / phone / email already used)
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0];
    return res.status(409).json({ error: field === "username" ? "USERNAME_TAKEN" : "ACCOUNT_DETAILS_IN_USE" });
  }
  // Deliberate errors thrown by the service: { status, code }
  if (err && typeof err.code === "string" && Number.isInteger(err.status)) {
    return res.status(err.status).json({ error: err.code });
  }
  console.error("❌ Sync failure:", err && (err.stack || err.message)); // log it, never send it
  return res.status(500).json({ error: "SYNC_FAILED" });
}

async function syncCurrentUser(req, res) {
  try {
    const fu = req.firebaseUser;
    if (!fu || !fu.uid) return res.status(401).json({ error: "UNAUTHORIZED_FIREBASE_USER" });

    const b = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const userData = {};

    for (const f of ["firstName", "lastName"]) {
      if (!present(b[f])) continue;
      const v = clean(b[f], 1, 50);
      if (!v || !NAME_RE.test(v)) throw new InputError(f);
      userData[f] = v;
    }

    if (present(b.username)) {
      const u = typeof b.username === "string" ? b.username.trim().toLowerCase() : "";
      if (!/^[a-z0-9_]{3,20}$/.test(u)) throw new InputError("username");
      userData.username = u;
    }

    if (present(b.phoneNumber)) {
      const p = normalizePhone(b.phoneNumber);
      if (!p) throw new InputError("phoneNumber");
      userData.phoneNumber = p;
    }

    if (present(b.brandName)) {
      const v = clean(b.brandName, 2, 60);
      if (!v) throw new InputError("brandName");
      userData.brandName = v;
    }

    // Shape check only. The SERVICE decides what this grants (see notes below).
    if (present(b.accountType)) {
      if (typeof b.accountType !== "string" || !/^[a-z_-]{2,30}$/i.test(b.accountType)) {
        throw new InputError("accountType");
      }
      userData.accountType = b.accountType;
    }

    userData.accountCategory = DEFAULT_CATEGORY;
    if (present(b.accountCategory)) {
      if (typeof b.accountCategory !== "string" || !ACCOUNT_CATEGORIES.includes(b.accountCategory)) {
        throw new InputError("accountCategory");
      }
      userData.accountCategory = b.accountCategory;
    }

    if (userData.accountCategory === "network" && REQUIRE_VERIFIED_EMAIL_FOR_NETWORK && !fu.email_verified) {
      return res.status(403).json({ error: "EMAIL_NOT_VERIFIED" });
    }

    userData.sponsorUserId = null;
    if (present(b.sponsorUserId)) {
      if (typeof b.sponsorUserId !== "string" || !/^[a-f\d]{24}$/i.test(b.sponsorUserId)) {
        throw new InputError("sponsorUserId");
      }
      userData.sponsorUserId = b.sponsorUserId;
    }

        // Referral from an invite link. Only a checked string ever becomes a query.
    if (present(b.referrer)) {
      const s = typeof b.referrer === "string" ? b.referrer.trim() : "";
      if (/^SDK-\d{6,9}$/i.test(s)) userData.referrer = { membershipNumber: s.toUpperCase() };
      else if (/^[a-zA-Z0-9_]{3,20}$/.test(s)) userData.referrer = { username: s.toLowerCase() };
      // anything else is ignored: a bad link must never block signup
    }

    // Prefer the Firebase-verified photo; accept a client URL only if it's https
    let photo = null;
    for (const raw of [b.profilePhoto, b.photoURL, b.profilePic]) {
      if (present(raw)) {
        photo = typeof raw === "string" ? cleanUrl(raw) : null;
        if (!photo) throw new InputError("profilePhoto");
        break;
      }
    }
   
    userData.profilePhoto = photo; // explicit uploads only

    const result = await synchronizeFirebaseUser({
      firebaseUid: fu.uid,
      email: fu.email,
      emailVerified: Boolean(fu.email_verified),
      displayName: typeof fu.name === "string" ? fu.name.slice(0, 100) : "",
      userData,
      defaultPhoto: fu.picture ? cleanUrl(fu.picture) : null
    });

    return res.json({ user: result.user, profile: result.profile });
  } catch (err) {
    return sendError(res, err);
  }
}

// POST /api/auth/become-marketer   (authenticate.strict)
async function becomeMarketer(req, res) {
  try {
    const b = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};

    // Ask Firebase directly: the token's email_verified flag can be stale for up to an hour
    const fb = await admin.auth().getUser(req.firebaseUser.uid);
    if (!fb.emailVerified) return res.status(403).json({ error: "EMAIL_NOT_VERIFIED" });

    const brandName = clean(b.brandName, 2, 60);
    const brandCategory = clean(b.brandCategory, 2, 40);
    const county = clean(b.county, 2, 40);
    const address = clean(b.address, 5, 200);
    for (const [k, v] of [["brandName", brandName], ["brandCategory", brandCategory], ["county", county], ["address", address]]) {
      if (!v) throw new InputError(k);
    }

    let username;
    if (b.username !== undefined && b.username !== "") {
      username = typeof b.username === "string" ? b.username.trim().toLowerCase() : "";
      if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new InputError("username");
    }
       let sponsor;
    if (b.sponsor !== undefined && b.sponsor !== "") {
      const s = typeof b.sponsor === "string" ? b.sponsor.trim() : "";
      if (/^SDK-\d{6,9}$/i.test(s)) sponsor = { membershipNumber: s.toUpperCase() };
      else if (/^[a-zA-Z0-9_]{3,20}$/.test(s)) sponsor = { username: s.toLowerCase() };
      else throw new InputError("sponsor");
    }

    const r = await upgradeToNetwork(req.user._id, { brandName, brandCategory, county, address, username, sponsor });
    return res.json({ ok: true, ...r, nextStep: "PAY_MEMBERSHIP" });
  } catch (err) {
    return sendError(res, err);
  }
}



// GET /api/auth/me (authenticate.tokenOnly): read-only, never creates anything
async function getMe(req, res) {
  try {
    const user = await User.findOne({ firebaseUid: req.firebaseUser.uid })
      .select("-firebaseUid -pathFromRoot -referrals -sponsorId -parentId -__v")
      .lean();
    if (!user) return res.json({ ok: true, synced: false });
    
    const { referredBy, ...safeUser } = user;
    const profile = await UserProfile.findOne({ userId: user._id }).lean();
    
    let referral = null;
    if (referredBy) {
      const rp = await UserProfile.findOne({ userId: referredBy }).select("username brandName displayName").lean();
      if (rp) {
        referral = { 
          username: rp.username || "", 
          name: rp.brandName || rp.displayName || "" 
        };
      }
    }
    
    return res.json({ ok: true, synced: true, user: safeUser, profile, referral });
  } catch (e) {
    console.error("❌ getMe:", e.stack || e.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}


module.exports = { syncCurrentUser, becomeMarketer, getMe };


