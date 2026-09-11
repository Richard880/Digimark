const { synchronizeFirebaseUser } = require("./auth.service");

async function syncCurrentUser(req, res) {
  const { firstName, lastName, phoneNumber, username, brandName, accountType, sponsorUserId } = req.body || {};
  const result = await synchronizeFirebaseUser({
    firebaseUid: req.firebaseUser.uid,
    email: req.firebaseUser.email,
    emailVerified: Boolean(req.firebaseUser.email_verified),
    displayName: req.firebaseUser.name || "",
    userData: { firstName, lastName, phoneNumber, username, brandName, accountType, sponsorUserId },
  });

  res.json({
    user: result.user,
    profile: result.profile,
  });
}

module.exports = { syncCurrentUser };
