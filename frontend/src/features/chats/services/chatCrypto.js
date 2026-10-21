import apiClient from "../../../services/apiClient";

const enc = new TextEncoder();
const dec = new TextDecoder();
const P256 = { name: "ECDH", namedCurve: "P-256" };
const ITER = 600000; // PBKDF2 rounds protecting the passphrase backup

export const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/* ───────── Identity (key pair) and passphrase backup ───────── */
export async function generateIdentity() {
  const pair = await crypto.subtle.generateKey(P256, true, ["deriveBits"]);
  return {
    publicKey: b64(await crypto.subtle.exportKey("raw", pair.publicKey)),
    pkcs8: await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  };
}

// The usable private key is imported as NON-extractable, so scripts can't read it back out
export const importPrivate = (pkcs8) => crypto.subtle.importKey("pkcs8", pkcs8, P256, false, ["deriveBits"]);

async function passphraseKey(passphrase, salt, iter) {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function makeBackup(pkcs8, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passphraseKey(passphrase, salt, ITER);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pkcs8);
  return { salt: b64(salt), iv: b64(iv), data: b64(data), iter: ITER };
}

export async function restoreFromBackup(backup, passphrase) {
  const key = await passphraseKey(passphrase, unb64(backup.salt), backup.iter);
  let pkcs8;
  try {
    pkcs8 = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(backup.iv) }, key, unb64(backup.data));
  } catch {
    throw Object.assign(new Error("WRONG_PASSPHRASE"), { code: "WRONG_PASSPHRASE" });
  }
  return importPrivate(pkcs8);
}

/* ───────── Local storage of the key (IndexedDB can hold a non-extractable CryptoKey) ───────── */
const idb = () =>
  new Promise((resolve, reject) => {
    const r = indexedDB.open("sokodigi-chat", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("identity");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
export async function saveIdentity(userId, value) {
  const db = await idb();
  await new Promise((res, rej) => { const t = db.transaction("identity", "readwrite"); t.objectStore("identity").put(value, userId); t.oncomplete = res; t.onerror = () => rej(t.error); });
}
export async function loadIdentity(userId) {
  try {
    const db = await idb();
    return await new Promise((res, rej) => { const r = db.transaction("identity").objectStore("identity").get(userId); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); });
  } catch { return null; }
}

/* ───────── Messages ───────── */
export async function deriveKey(privateKey, peerPubB64, conversationId) {
  const peerPub = await crypto.subtle.importKey("raw", unb64(peerPubB64), P256, false, []);
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: peerPub }, privateKey, 256);
  const hk = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode(conversationId), info: enc.encode("sokodigi-chat-v1") },
    hk, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

// The authentication data ties every message to its conversation and both public keys,
// so the server can't move a message into another chat or pretend it came from someone else
const aad = ({ cid, senderPub, recipPub }) => enc.encode(`${cid}|${senderPub}|${recipPub}`);

export async function encryptPayload(key, payload, ctx) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(ctx) }, key, enc.encode(JSON.stringify(payload)));
  return { ciphertext: b64(ct), iv: b64(iv) };
}
export async function decryptPayload(key, m, ctx) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(m.iv), additionalData: aad(ctx) }, key, unb64(m.ciphertext));
  return JSON.parse(dec.decode(pt));
}

// 30 digits shown in groups of 5. Two people compare these to confirm no one swapped their keys.
export async function securityCode(pubA, pubB) {
  const [a, b] = [pubA, pubB].sort();
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(a + b)));
  const digits = [...hash].map((x) => String(x % 10)).join("").slice(0, 30);
  return digits.match(/.{1,5}/g).join(" ");
}

/* ───────── Encrypted photos ───────── */
const CLOUD = String(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "").replace(/[^\w-]/g, "");
export const isChatBlobUrl = (u) =>
  typeof u === "string" && !!CLOUD && new RegExp(`^https://res\\.cloudinary\\.com/${CLOUD}/raw/upload/(v\\d+/)?sokodigi/chat/[\\w-]+\\.bin$`).test(u);

// Re-encoding through a canvas shrinks the photo AND removes location and camera data
export async function compressImage(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw Object.assign(new Error("BAD_TYPE"), { code: "BAD_TYPE" });
  if (file.size > 12 * 1024 * 1024) throw Object.assign(new Error("TOO_BIG"), { code: "TOO_BIG" });
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  for (const q of [0.82, 0.65, 0.5]) {
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= 1.5 * 1024 * 1024) return { blob, w, h };
  }
  throw Object.assign(new Error("TOO_BIG"), { code: "TOO_BIG" });
}

export async function encryptImage(blob) {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, await blob.arrayBuffer());
  return { bytes, key: b64(await crypto.subtle.exportKey("raw", key)), iv: b64(iv) };
}

export async function uploadEncrypted(bytes) {
  const { data: s } = await apiClient.post("/upload/sign", { folderType: "chat" });
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/octet-stream" }));
  form.append("api_key", s.apiKey);
  form.append("signature", s.signature);
  Object.entries(s.uploadParams).forEach(([k, v]) => form.append(k, String(v)));
  const res = await fetch(`https://api.cloudinary.com/v1_1/${s.cloudName}/raw/upload`, { method: "POST", body: form });
  const out = await res.json().catch(() => null);
  if (!res.ok || !isChatBlobUrl(out?.secure_url)) throw new Error("UPLOAD_FAILED");
  return out.secure_url;
}

// The URL arrives inside an encrypted message, but is still checked: only our own storage is ever fetched
export async function decryptImage(meta) {
  if (!meta || !isChatBlobUrl(meta.url) || typeof meta.key !== "string" || meta.key.length !== 44 || typeof meta.iv !== "string" || meta.iv.length !== 16) {
    throw new Error("BAD_IMAGE");
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(meta.url, { signal: ctrl.signal });
    if (!res.ok) throw new Error("FETCH_FAILED");
    const key = await crypto.subtle.importKey("raw", unb64(meta.key), { name: "AES-GCM" }, false, ["decrypt"]);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(meta.iv) }, key, await res.arrayBuffer());
    return URL.createObjectURL(new Blob([pt], { type: "image/jpeg" }));
  } finally {
    clearTimeout(timer);
  }
}
