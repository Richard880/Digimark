let state = { deferred: null, applyUpdate: null, installed: false };
const listeners = new Set();
const set = (patch) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };

export const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const getSnapshot = () => state;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); set({ deferred: e }); });
  window.addEventListener("appinstalled", () => set({ deferred: null, installed: true }));
}

export const setUpdateReady = (applyUpdate) => set({ applyUpdate });

export async function promptInstall() {
  const e = state.deferred;
  if (!e) return "unavailable";
  e.prompt();
  const { outcome } = await e.userChoice;
  set({ deferred: null });
  return outcome; // "accepted" | "dismissed"
}

const SNOOZE_KEY = "sokodigi_install_snooze";
export const isSnoozed = () => {
  try { return Date.now() < Number(localStorage.getItem(SNOOZE_KEY) || 0); } catch { return false; }
};
export const snoozeInstall = (days = 30) => {
  try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + days * 86400000)); } catch { /* storage blocked */ }
};
