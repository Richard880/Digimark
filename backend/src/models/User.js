const mongoose = require("mongoose");
const { Schema } = mongoose;

const MAX_DIRECT = 10;
const ADMIN_ROLES = ["super_admin", "admin"];

const userSchema = new Schema(
  {
    firebaseUid: { type: String, required: true, unique: true, immutable: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },

    // Privileges. NEVER set from a request body.
    role: { type: String, enum: ["super_admin", "admin", "member", "user"], default: "user" },
    accountType: { type: String, enum: ["member", "user"], default: "user" }, // kept in sync by the hook
    accountCategory: { type: String, enum: ["retail", "network"], required: true, default: "retail" },

    // pending = registered but fee not paid. Only "active" members may sell or earn.
   // 1. add "expired" to the status enum
    membershipStatus: { type: String, enum: ["pending", "active", "expired", "suspended", "cancelled"], default: "pending" },
    plan: { type: String, enum: ["phase1", "phase2", "phase3", "phase4"], default: null },
    membershipStartedAt: { type: Date, default: null },
    membershipExpiresAt: { type: Date, default: null },
    expiryRemind7For: { type: Date, default: null },
    expiryRemind1For: { type: Date, default: null },

    isActive: { type: Boolean, default: true }, // admin kill switch (false = account disabled)
    emailVerified: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },

    // Commission gate. Written ONLY by the activity engine, never by requests.
    commissionEligible: { type: Boolean, default: false },
    eligibilityCheckedAt: { type: Date, default: null },
    lastActiveDay: { type: String, default: null },
    activityScore: { type: Number, default: 0, min: 0, max: 5 },

    // Matrix fields (These must be declared as key-value pairs inside the object)
    sponsorId: { type: Schema.Types.ObjectId, ref: "User", default: null }, // who recruited them
    // Who invited them at signup. Set once. A buyer has no sponsorId, so the referral lives here until they upgrade.
    referredBy: { type: Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
    parentId: { type: Schema.Types.ObjectId, ref: "User", default: null },  // where the matrix placed them
    
    // Slots are claimed with an atomic $expr-guarded $push. Never $push here from anywhere else.
    referrals: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    
    // All ancestors, root first. Powers downline and commission queries.
    pathFromRoot: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
  },
  { timestamps: true }
);

// Database Matrix Indexes (Placed safely OUTSIDE the configuration object down here)
userSchema.index({ sponsorId: 1, membershipStartedAt: 1 });
userSchema.index({ accountCategory: 1, membershipStatus: 1, eligibilityCheckedAt: 1 });

// Indexes (unique ones above already create theirs)
userSchema.index({ sponsorId: 1 });
userSchema.index({ parentId: 1 });
userSchema.index({ pathFromRoot: 1 }); // multikey
userSchema.index({ accountCategory: 1, membershipStatus: 1, commissionEligible: 1 });
// 3. with the other indexes
userSchema.index({ membershipStatus: 1, membershipExpiresAt: 1 });

// Backup guard. The REAL slot protection is the atomic filter in claimSlot().
userSchema.pre("save", function () {
  const self = String(this._id);

  if (this.accountCategory === "retail") {
    this.sponsorId = null;
    this.parentId = null;
    this.referrals = [];
    this.pathFromRoot = [];
    this.commissionEligible = false;
  }

  if (this.sponsorId && String(this.sponsorId) === self) throw new Error("MATRIX_INTEGRITY_VIOLATION: self-sponsor");
  if (this.parentId && String(this.parentId) === self) throw new Error("MATRIX_INTEGRITY_VIOLATION: self-parent");
  if (this.referrals.length > MAX_DIRECT) {
    throw new Error("MATRIX_INTEGRITY_VIOLATION: referrals cannot exceed 10 legs");
  }

  // role/accountType follow the category (admins keep their own role)
  if (!ADMIN_ROLES.includes(this.role)) {
    const r = this.accountCategory === "network" ? "member" : "user";
    this.role = r;
    this.accountType = r;
  }
});

// Safety net: never serialize internals to a browser
userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.firebaseUid;
    delete ret.pathFromRoot;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
