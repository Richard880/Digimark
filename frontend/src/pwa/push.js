import apiClient from "../services/apiClient";

export const pushSupported = () =>
  import.meta.env.PROD && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const err = (code) => Object.assign(new Error(code), { code });
const toBytes = (b64) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
};
const toB64Url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(err("TIMEOUT")), ms))]);

const ready = () => withTimeout(navigator.serviceWorker.ready, 8000);

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

async function subscribeThisDevice() {
  const { data } = await apiClient.get("/push/public-key");
  const reg = await ready();
  let sub = await reg.pushManager.getSubscription();
  // If the server's key was ever rotated, the old subscription can't work any more
  if (sub?.options?.applicationServerKey && toB64Url(sub.options.applicationServerKey) !== data.key) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(data.key) });
  await apiClient.post("/push/subscribe", { subscription: sub.toJSON() });
  return sub;
}

// Must be called from a tap or click: that's what lets the browser show its permission prompt
export async function enablePush() {
  if (!pushSupported()) throw err("UNSUPPORTED");
  const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (perm !== "granted") throw err("DENIED");
  await subscribeThisDevice();
  return true;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  try { await apiClient.post("/push/unsubscribe", { endpoint: sub.endpoint }); } catch { /* the server cleans up dead devices itself */ }
  await sub.unsubscribe();
}

// On logout: stop this phone receiving the signed-out user's alerts
export async function detachDevice() {
  try {
    const sub = await currentSubscription();
    if (!sub) return;
    await Promise.race([apiClient.post("/push/unsubscribe", { endpoint: sub.endpoint }), new Promise((r) => setTimeout(r, 2500))]);
    await sub.unsubscribe();
  } catch { /* never block logging out */ }
}

// On every app start while signed in: refresh this device and silently re-subscribe if needed
export async function syncPush() {
  if (!pushSupported() || Notification.permission !== "granted") return;
  try {
    if (sessionStorage.getItem("sokodigi_push_synced")) return;
    await subscribeThisDevice();
    sessionStorage.setItem("sokodigi_push_synced", "1");
  } catch { /* try again next visit */ }
}

export const sendTestPush = () => apiClient.post("/push/test");
