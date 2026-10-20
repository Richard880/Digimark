const KEY = "sokodigi_referral";
const TTL = 30 * 24 * 3600 * 1000;
const RE = /^(SDK-\d{6,9}|[a-zA-Z0-9_]{3,20})$/i;

export function getReferral() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!v || Date.now() - v.at > TTL || !RE.test(v.code)) return undefined;
    return v.code;
  } catch { return undefined; }
}

export function captureReferral() {
  try {
    if (getReferral()) return; // first referrer wins
    const s = new URLSearchParams(window.location.search).get("sponsor");
    if (s && RE.test(s)) localStorage.setItem(KEY, JSON.stringify({ code: s, at: Date.now() }));
  } catch { /* storage can be blocked: skip */ }
}

export function clearReferral() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
