const strip = (ip) => String(ip || "").replace(/^::ffff:/, "");
const allowed = (process.env.MPESA_CALLBACK_IPS || "").split(",").map((s) => s.trim()).filter(Boolean);
if (!allowed.length) console.warn("⚠️  MPESA_CALLBACK_IPS is not set: callbacks are accepted from any address (the URL secret still applies).");

// Unknown senders get the same 404 as a route that doesn't exist
module.exports = (req, res, next) => (!allowed.length || allowed.includes(strip(req.ip)) ? next() : res.sendStatus(404));
