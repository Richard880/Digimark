const streamToken = require("../utils/streamToken");
const wallets = require("../data/wallets");

module.exports = function verifyStreamSegment(req, res, next) {
  // Check URL first, then Headers
  // In middleware/verifyStreamSegment.js
  const token = req.query.token || req.headers["x-stream-token"];

  if (!token) {
    console.log("❌ 403: No Token in URL or Header");
    return res.status(403).send("Forbidden: No Token");
  }

  try {
    const claims = streamToken.verify(token);

    if (!claims) {
      console.log("❌ 403: Token Verification Failed");
      return res.sendStatus(403);
    }

    // Wallet Check
    const wallet = wallets.getWallet(claims.userId);
    if (!wallet || !wallets.hasActiveFloat(wallet)) {
      console.log("❌ 402: Float Required");
      return res.status(402).send("Float Required");
    }

    // Video Match
    if (claims.videoId !== req.params.id) {
      console.log(
        `❌ 403: ID Mismatch. Token: ${claims.videoId}, Req: ${req.params.id}`,
      );
      return res.status(403).send("ID Mismatch");
    }

    next();
  } catch (err) {
    console.log("❌ 403: Token Invalid");
    return res.status(403).send("Invalid Token");
  }
};
