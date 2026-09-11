// utils/streamToken.js
const jwt = require("jsonwebtoken");

const SECRET = process.env.STREAM_SECRET || "dev-stream-secret";
const DEFAULT_TTL = 60 * 60; // seconds


function signStreamToken({ userId, videoId }) {
  return jwt.sign({ userId, videoId }, SECRET, { expiresIn: "2h" });
}

/* ======================================================
   Verify stream token
====================================================== */
function verifyStreamToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

/* ======================================================
   Alias helpers (optional shortcuts)
====================================================== */
const sign = ({ userId, videoId, mode = "full", ua, ip, ttl = DEFAULT_TTL }) =>
  signStreamToken({ userId, videoId, mode, ua, ip, ttl });

const verify = (token) => verifyStreamToken(token);

/* ======================================================
   Exporting
====================================================== */
module.exports = {
  signStreamToken,
  verifyStreamToken,
  sign,
  verify,
  DEFAULT_TTL,
};
