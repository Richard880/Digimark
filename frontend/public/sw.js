// Sokodigi service worker. Bump VERSION to force every device to refresh its cache.
const VERSION = "v3";
const STATIC = `sokodigi-static-${VERSION}`;
const PAGES = `sokodigi-pages-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.add(OFFLINE_URL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name !== STATIC && name !== PAGES) await caches.delete(name);
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

/* ───────── Push notifications ───────── */
const safeUrl = (u) => (typeof u === "string" && u.startsWith("/") && !u.startsWith("//") ? u : "/notifications");

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = {}; }
  const tag = typeof d.tag === "string" && d.tag ? d.tag.slice(0, 60) : undefined;
  event.waitUntil(
    self.registration.showNotification(String(d.title || "Sokodigi").slice(0, 80), {
      body: String(d.body || "You have a new notification.").slice(0, 200),
      icon: "/icons/icon-192.png",
      tag,
      renotify: !!tag, // a newer alert with the same tag replaces the old one and still buzzes
      data: { url: safeUrl(d.url) },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of wins) {
        if (new URL(c.url).origin === self.location.origin) {
          await c.focus();
          c.postMessage({ type: "sokodigi-navigate", url }); // the app navigates without a reload
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});

/* ───────── Caching (unchanged) ───────── */
async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}
async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200) { cache.put(req, res.clone()); trim(STATIC, 120); }
  return res;
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => { if (res.ok && res.status === 200) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || fresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never touch other sites
  if (url.pathname.startsWith("/api/")) return;      // never cache account, order, chat or money data
 if (req.mode === "navigate") {
  event.respondWith((async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000); // a very slow connection falls back to the saved app
    try {
      const res = await fetch(req, { signal: ctrl.signal });
      if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
        (await caches.open(PAGES)).put("/__shell", res.clone()); // the app shell has no personal data
      }
      return res;
    } catch {
      return (await caches.match("/__shell")) || (await caches.match(OFFLINE_URL));
    } finally { clearTimeout(t); }
  })());
  return;
}
  if (url.pathname.startsWith("/assets/")) { event.respondWith(cacheFirst(req)); return; }
  if (/\.(?:png|jpe?g|webp|svg|ico|woff2?)$/.test(url.pathname) || url.pathname === "/manifest.webmanifest") event.respondWith(staleWhileRevalidate(req));
});
