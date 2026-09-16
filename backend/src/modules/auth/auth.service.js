const User = require("../../models/User");
const UserProfile = require("../../models/UserProfile");
const MemberNetwork = require("../../models/MemberNetwork");
const generateMembershipNumber = require("../../../utils/membershipNumber");

async function synchronizeFirebaseUser({ firebaseUid, email, emailVerified, displayName, userData = {} }) {
  let user = await User.findOne({ firebaseUid });

  if (!user) {
    const accountType = userData.accountType === "member" ? "member" : "user";
    user = await User.create({
      firebaseUid,
      email,
      accountType,
      role: accountType === "member" ? "member" : "user",
      membershipStatus: accountType === "member" ? "pending" : "active",
      emailVerified,
    });
  } else {
    user.email = email;
    user.emailVerified = emailVerified;
    user.lastLoginAt = new Date();
    await user.save();
  }

  let profile = await UserProfile.findOne({ userId: user._id });
  if (!profile) {
    const membershipNumber = user.accountType === "member" ? await generateMembershipNumber() : undefined;
    const firstName = userData.firstName || displayName?.split(" ")[0] || "";
    const lastName = userData.lastName || displayName?.split(" ").slice(1).join(" ") || "";

    profile = await UserProfile.create({
      userId: user._id,
      membershipNumber,
      username: userData.username,
      firstName,
      lastName,
      displayName: displayName || `${firstName} ${lastName}`.trim(),
      brandName: userData.brandName || `${firstName} ${lastName}`.trim(),
      phoneNumber: userData.phoneNumber || "",
    });
  }

  if (user.accountType === "member" && userData.sponsorUserId) {
    await MemberNetwork.findOneAndUpdate(
      { userId: user._id },
      { sponsorUserId: userData.sponsorUserId },
      { upsert: true, new: true }
    );
  }

  return { user, profile };
}

module.exports = { synchronizeFirebaseUser };
