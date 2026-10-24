import { useState } from "react";
import { useLocation } from "react-router-dom";
import useAuth from "../features/auth/hooks/useAuth";
import { usePWA } from "./usePWA";
import { isSnoozed, snoozeInstall } from "./pwaStore";

// Pages with their own sticky bar or a typing area: never show the banner there
const HIDE_ON = ["/checkout", "/product-details", "/membership", "/messages", "/register"];

function countVisit() {
  try {
    if (!sessionStorage.getItem("sokodigi_counted")) {
      sessionStorage.setItem("sokodigi_counted", "1");
      localStorage.setItem("sokodigi_visits", String((Number(localStorage.getItem("sokodigi_visits")) || 0) + 1));
    }
    return Number(localStorage.getItem("sokodigi_visits")) || 1;
  } catch { return 1; }
}

function IosSheet({ onClose }) {
  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-900/60 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Add Sokodigi to your Home Screen" className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-black text-slate-900">Add Sokodigi to your Home Screen</h3>
        <ol className="space-y-2 text-sm text-slate-700">
          <li><b>1.</b> Tap the <b>Share</b> button <span aria-hidden="true">(a square with an arrow)</span> at the bottom of Safari.</li>
          <li><b>2.</b> Scroll down and tap <b>Add to Home Screen</b>.</li>
          <li><b>3.</b> Tap <b>Add</b>. Sokodigi now opens like an app.</li>
        </ol>
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">Use Safari for this. Other browsers on iPhone may not show the option.</p>
        <button type="button" onClick={onClose} className="min-h-11 w-full rounded-xl bg-emerald-700 text-sm font-black text-white">Got it</button>
      </div>
    </div>
  );
}

export function InstallLink({ className = "" }) {
  const { canInstall, iosInstall, install } = usePWA();
  const [help, setHelp] = useState(false);
  if (!canInstall && !iosInstall) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => (canInstall ? install() : setHelp(true))}>Get the app</button>
      {help && <IosSheet onClose={() => setHelp(false)} />}
    </>
  );
}

export default function InstallPrompt() {
  const { auth } = useAuth();
  const { pathname } = useLocation();
  const { canInstall, iosInstall, install } = usePWA();
  const [visits] = useState(countVisit);
  const [hidden, setHidden] = useState(isSnoozed);
  const [help, setHelp] = useState(false);

  const engaged = auth.authenticated || visits >= 2;
  const onBlockedPage = HIDE_ON.some((p) => pathname.startsWith(p));
  if (hidden || !engaged || onBlockedPage || (!canInstall && !iosInstall)) return help ? <IosSheet onClose={() => setHelp(false)} /> : null;

  const dismiss = () => { snoozeInstall(30); setHidden(true); };
  const go = async () => {
    if (canInstall) {
      const outcome = await install();
      if (outcome === "dismissed") dismiss();
    } else {
      setHelp(true);
    }
  };

  return (
    <>
      <div role="region" aria-label="Install the Sokodigi app" className="fixed inset-x-3 z-30 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-emerald-100 bg-white p-3 shadow-xl lg:hidden"
        style={{ bottom: auth.authenticated ? "calc(4.25rem + env(safe-area-inset-bottom))" : "calc(0.75rem + env(safe-area-inset-bottom))" }}>
        <img src="/icons/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-900">Get the Sokodigi app</p>
          <p className="text-[11px] leading-snug text-slate-500">Faster, full-screen, one tap from your Home Screen.</p>
        </div>
        <button type="button" onClick={go} className="min-h-10 shrink-0 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white">{canInstall ? "Install" : "How"}</button>
        <button type="button" onClick={dismiss} aria-label="Not now" className="shrink-0 rounded-lg px-1.5 py-1 text-slate-400 hover:bg-slate-100">✕</button>
      </div>
      {help && <IosSheet onClose={() => setHelp(false)} />}
    </>
  );
}
