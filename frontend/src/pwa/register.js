import { setUpdateReady } from "./pwaStore";

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return; // only real builds, never dev

  let updating = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (updating) window.location.reload(); // only after the user chose to update
  });

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");

      const offerUpdate = () => {
        // A first-ever install has no controller yet, so there's nothing to "update"
        if (reg.waiting && navigator.serviceWorker.controller) {
          setUpdateReady(() => { updating = true; reg.waiting.postMessage("SKIP_WAITING"); });
        }
      };
      offerUpdate();
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => worker.state === "installed" && offerUpdate());
      });

      // Check for a new version whenever the app comes back to the foreground
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    } catch (e) {
      console.error("Service worker registration failed:", e?.message);
    }
  });
}
