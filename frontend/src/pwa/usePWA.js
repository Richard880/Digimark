import { useSyncExternalStore } from "react";
import { subscribe, getSnapshot, promptInstall } from "./pwaStore";

const subOnline = (cb) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
};

export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function usePWA() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const online = useSyncExternalStore(subOnline, () => navigator.onLine, () => true);
  const standalone = isStandalone();
  return {
    online,
    standalone,
    canInstall: !!s.deferred && !standalone && !s.installed, // Android and desktop browsers
    iosInstall: isIOS() && !standalone && !s.installed,      // iPhone and iPad: needs the manual steps
    install: promptInstall,
    updateReady: !!s.applyUpdate,
    applyUpdate: () => s.applyUpdate?.(),
  };
}
