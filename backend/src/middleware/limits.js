const rateLimit = require("express-rate-limit");

let Ratelimit, Redis;
try {
  ({ Ratelimit } = require("@upstash/ratelimit"));
  ({ Redis } = require("@upstash/redis"));
} catch {
  // Packages are optional; fall back to per-instance memory limiting.
}

const redis =
  Ratelimit &&
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

if (!redis) {
  console.warn(
    "⚠️ Shared rate limiting is OFF (limits are per instance). Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
  );
}

let seq = 0; // Each limiter gets its own bucket; register in the same order on every instance.

const idOf = (kind, req) =>
  kind === "u"
    ? String(req.user._id)
    : kind === "k"
      ? String(req.apiKeyId)
      : req.ip;

function make(kind, limit, windowMs) {
  const name = `${kind}${++seq}`;

  const memory = rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "TOO_MANY_REQUESTS" },
    ...(kind !== "i" ? { keyGenerator: (req) => idOf(kind, req) } : {}),
  });

  if (!redis) return memory;

  const rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(
      limit,
      `${Math.max(1, Math.round(windowMs / 1000))} s`
    ),
    prefix: `rl:${name}`,
  });

  return async (req, res, next) => {
    try {
      const id = idOf(kind, req);
      const { success, reset } = await rl.limit(id);

      if (!success) {
        res.set(
          "Retry-After",
          String(Math.max(1, Math.ceil((reset - Date.now()) / 1000)))
        );
        return res.status(429).json({ error: "TOO_MANY_REQUESTS" });
      }

      return next();
    } catch (e) {
      console.error(
        "⚠️ rate-limit store error, using the per-instance fallback:",
        e.message
      );
      return memory(req, res, next);
    }
  };
}

// Apply perUser after authentication and perKey after API-key authentication.
const perUser = (limit, windowMs = 60 * 1000) => make("u", limit, windowMs);
const perIp = (limit, windowMs = 60 * 1000) => make("i", limit, windowMs);
const perKey = (limit, windowMs = 60 * 1000) => make("k", limit, windowMs);

module.exports = { perUser, perIp, perKey };
