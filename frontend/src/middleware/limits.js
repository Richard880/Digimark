const rateLimit = require("express-rate-limit");

let Ratelimit, Redis;
try { ({ Ratelimit } = require("@upstash/ratelimit")); ({ Redis } = require("@upstash/redis")); } catch { /* packages not installed */ }

const redis = Ratelimit && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN }) : null;
if (!redis) console.warn("⚠️  Shared rate limiting is OFF (limits are per instance). Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");

let seq = 0; // each limiter gets its own bucket; routes register in the same order on every instance

function make(kind, limit, windowMs) {
  const name = `${kind}${++seq}`;
  const memory = rateLimit({
    windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { error: "TOO_MANY_REQUESTS" },
    ...(kind === "u" ? { keyGenerator: (req) => String(req.user._id) } : {}), // IP limiters use the library's own IP handling
  });
  if (!redis) return memory;

  const rl = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(limit, `${Math.max(1, Math.round(windowMs / 1000))} s`), prefix: `rl:${name}` });
  return async (req, res, next) => {
    try {
      const id = kind === "u" ? String(req.user._id) : req.ip;
      const { success, reset } = await rl.limit(id);
      if (!success) {
        res.set("Retry-After", String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))));
        return res.status(429).json({ error: "TOO_MANY_REQUESTS" });
      }
      return next();
    } catch (e) {
      console.error("⚠️ rate-limit store error, using the per-instance fallback:", e.message); // never block users because Redis is down
      return memory(req, res, next);
    }
  };
}

const perUser = (limit, windowMs = 60 * 1000) => make("u", limit, windowMs); // run AFTER authenticate
const perIp = (limit, windowMs = 60 * 1000) => make("i", limit, windowMs);

module.exports = { perUser, perIp };
