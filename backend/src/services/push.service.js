const webpush = require("web-push");
const PushSubscription = require("../models/PushSubscription");
const User = require("../models/User");

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT;

let ENABLED = false;
try {
  if (PUBLIC_KEY && PRIVATE_KEY && SUBJECT) {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    ENABLED = true;
  }
} catch (e) {
  console.error("❌ Invalid VAPID settings:", e.message);
}
if (!ENABLED) console.warn("⚠️  Push notifications are OFF. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT to enable them.");

// Only genuine browser push services (blocks the server being aimed at internal addresses)
const HOSTS = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[\w-]+\.push\.services\.mozilla\.com|[\w.-]+\.notify\.windows\.com|web\.push\.apple\.com|[\w.-]+\.push\.apple\.com)$/;
function isAllowedEndpoint(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.port && !u.username && !u.password && HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

const clip = (v, n) => String(v || "").slice(0, n);
const internal = (u) => (typeof u === "string" && u.startsWith("/") && !u.startsWith("//") ? u.slice(0, 200) : "/notifications");

async function deliver(subs, payload) {
  const body = JSON.stringify(payload);
  const gone = [], failed = [];
  let sent = 0;
  for (let i = 0; i < subs.length; i += 20) {
    await Promise.allSettled(
      subs.slice(i, i + 20).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 86400, timeout: 5000, urgency: "normal" });
          sent++;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) gone.push(s._id); // the device unsubscribed
          else { failed.push(s._id); console.error("❌ push failed:", e.statusCode || e.message); }
        }
      })
    );
  }
  try {
    if (gone.length) await PushSubscription.deleteMany({ _id: { $in: gone } });
    if (failed.length) {
      await PushSubscription.updateMany({ _id: { $in: failed } }, { $inc: { failCount: 1 } });
      await PushSubscription.deleteMany({ _id: { $in: failed }, failCount: { $gte: 5 } });
    }
  } catch (e) { console.error("❌ push cleanup:", e.message); }
  return { sent };
}

async function run(docs) {
  const ids = [...new Set(docs.map((d) => String(d.recipientId)))];
  const [users, subs] = await Promise.all([
    User.find({ _id: { $in: ids }, isActive: true, membershipStatus: { $ne: "suspended" } }).select("pushPrefs pushHideDetails").lean(),
    PushSubscription.find({ userId: { $in: ids } }).select("userId endpoint keys").lean(),
  ]);
  const userBy = new Map(users.map((u) => [String(u._id), u]));
  const subsBy = new Map();
  subs.forEach((s) => subsBy.set(String(s.userId), [...(subsBy.get(String(s.userId)) || []), s]));

  for (const d of docs) {
    const u = userBy.get(String(d.recipientId));
    const mine = subsBy.get(String(d.recipientId));
    if (!u || !mine?.length || u.pushPrefs?.[d.category] === false) continue;

    const hide = u.pushHideDetails === true;
    const m = d.metadata || {};
    await deliver(mine, {
      title: hide ? "Sokodigi" : clip(d.title, 80),
      body: hide ? "You have a new notification." : clip(d.message, 200),
      url: internal(d.actionUrl),
      tag: m.conversationId ? `chat-${m.conversationId}` : `n-${d.type}-${m.orderId || ""}`.slice(0, 60),
    });
  }
}

/** Called by notify(). Never throws, and never holds a request for more than 7 seconds. */
async function sendPush(docs) {
  if (!ENABLED || !docs?.length) return;
  let timer;
  try {
    await Promise.race([run(docs), new Promise((r) => { timer = setTimeout(r, 7000); })]);
  } catch (e) {
    console.error("❌ sendPush:", e.message);
  } finally {
    clearTimeout(timer);
  }
}

// Used by the "Send a test" button
async function sendToUser(userId, payload) {
  if (!ENABLED) return { sent: 0 };
  const subs = await PushSubscription.find({ userId }).select("endpoint keys").lean();
  if (!subs.length) return { sent: 0 };
  return deliver(subs, { title: clip(payload.title, 80), body: clip(payload.body, 200), url: internal(payload.url), tag: clip(payload.tag, 60) });
}

module.exports = { ENABLED, PUBLIC_KEY, isAllowedEndpoint, sendPush, sendToUser };
