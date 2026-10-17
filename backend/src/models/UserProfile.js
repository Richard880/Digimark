const mongoose = require("mongoose");
const { Schema } = mongoose;

const RESERVED = [
  "admin", "administrator", "root", "support", "help", "api", "sokodigi", "soko",
  "official", "staff", "system", "moderator", "login", "signup", "wallet", "orders",
];

function normalizePhone(v) {
  if (typeof v !== "string") return v;
  const p = v.replace(/[\s+-]/g, "");
  if (/^0[17]\d{8}$/.test(p)) return "254" + p.slice(1);
  return p;
}

const isHttps = (v) => !v || (typeof v === "string" && v.length <= 500 && /^https:\/\/\S+$/.test(v));

const userProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, immutable: true },

    // Set once at activation by the membership service, never from a request
    membershipNumber: { type: String, unique: true, sparse: true, immutable: true },

    username: {
      type: String, unique: true, sparse: true, lowercase: true, trim: true,
      validate: [
        { validator: (v) => !v || /^[a-z0-9_]{3,20}$/.test(v), message: "Invalid username format" },
        { validator: (v) => !v || !RESERVED.includes(v), message: "Username not available" },
      ],
    },

    firstName: { type: String, trim: true, default: "", maxlength: 50 },
    lastName: { type: String, trim: true, default: "", maxlength: 50 },
    displayName: { type: String, trim: true, default: "", maxlength: 100 },
    bio: { type: String, trim: true, default: "", maxlength: 500 },

    // ---- Brand profile (shop landing page) ----
    brandName: { type: String, trim: true, default: "", maxlength: 60 },
    brandCategory: { type: String, trim: true, lowercase: true, default: "", maxlength: 40 },
    profilePhoto: { type: String, default: "", validate: { validator: isHttps, message: "Photo must be an https URL" } },
    coverPhoto: { type: String, default: "", validate: { validator: isHttps, message: "Cover must be an https URL" } },

    // Payout destination. Locked once set (enforced in auth.service and the profile controller).
    phoneNumber: {
      type: String, trim: true, default: "",
      set: normalizePhone,
      validate: { validator: (v) => !v || /^254[17]\d{8}$/.test(v), message: "Invalid phone number" },
    },

    location: {
      county: { type: String, trim: true, default: "", maxlength: 40 },
      subCounty: { type: String, trim: true, default: "", maxlength: 40 },
      country: { type: String, trim: true, default: "Kenya", maxlength: 40 },
    },
    // Business address: stays off the public profile (the public controller whitelists fields)
    address: { type: String, trim: true, default: "", maxlength: 200 },

    // Verification state. Written ONLY by the system or admins, never by the user.
    kycStatus: { type: String, enum: ["none", "submitted", "verified", "rejected"], default: "none" },

    // Up to 5 shop-front products (limit enforced atomically, see featureProduct)
    featuredProducts: {
      type: [{ type: Schema.Types.ObjectId, ref: "Product" }],
      default: [],
      validate: { validator: (a) => a.length <= 5, message: "Maximum 5 featured products" },
    },

    // System-controlled
    marketerLevel: {
      type: String,
      enum: ["starter", "bronze", "silver", "gold", "platinum", "diamond"],
      default: "starter",
    },
    publicProfile: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// One payout phone per account. Partial index: the empty string default is ignored.
userProfileSchema.index(
  { phoneNumber: 1 },
  { unique: true, partialFilterExpression: { phoneNumber: { $type: "string", $gt: "" } } }
);
userProfileSchema.index({ publicProfile: 1, username: 1 });

userProfileSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.models.UserProfile || mongoose.model("UserProfile", userProfileSchema);
