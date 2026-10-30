let opened;
const open = () => (opened ||= new Promise((resolve, reject) => {
  if (typeof indexedDB === "undefined") return reject(new Error("NO_IDB"));
  const r = indexedDB.open("sokodigi-pos", 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore("kv");
    r.result.createObjectStore("outbox", { keyPath: "clientRef" }).createIndex("userId", "userId");
  };
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => { opened = null; reject(r.error); };
}));

const run = (store, mode, fn) => open().then((db) => new Promise((resolve, reject) => {
  const t = db.transaction(store, mode);
  const req = fn(t.objectStore(store));
  t.oncomplete = () => resolve(req ? req.result : undefined);
  t.onerror = () => reject(t.error);
  t.onabort = () => reject(t.error || new Error("ABORTED"));
}));

export const kvGet = (k) => run("kv", "readonly", (s) => s.get(k));
export const kvSet = (k, v) => run("kv", "readwrite", (s) => s.put(v, k));
export const outboxAll = (uid) => run("outbox", "readonly", (s) => s.index("userId").getAll(uid));
export const outboxPut = (item) => run("outbox", "readwrite", (s) => s.put(item));
export const outboxDelete = (ref) => run("outbox", "readwrite", (s) => s.delete(ref));

export const nextLocalNo = (uid) => open().then((db) => new Promise((resolve, reject) => {
  const t = db.transaction("kv", "readwrite");
  const s = t.objectStore("kv");
  const g = s.get(`localno:${uid}`);
  g.onsuccess = () => { const n = (g.result || 0) + 1; s.put(n, `localno:${uid}`); t.oncomplete = () => resolve(n); };
  t.onerror = () => reject(t.error);
}));
