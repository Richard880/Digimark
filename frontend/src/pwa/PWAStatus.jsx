import useAuth from "../features/auth/hooks/useAuth";
import { usePWA } from "./usePWA";

export default function PWAStatus() {
  const { auth } = useAuth();
  const { online, updateReady, applyUpdate } = usePWA();

  return (
    <>
      {!online && (
        <div role="status" className="fixed inset-x-0 top-0 z-[60] bg-slate-900 px-4 py-2 text-center text-xs font-bold text-white" style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}>
          You're offline. Some features won't work until you reconnect.
        </div>
      )}
      {updateReady && (
        <div role="status" className="fixed inset-x-3 z-[60] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-slate-900 p-3 text-white shadow-xl"
          style={{ bottom: auth.authenticated ? "calc(4.25rem + env(safe-area-inset-bottom))" : "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          <p className="text-xs font-semibold">A new version of Sokodigi is ready.</p>
          <button type="button" onClick={applyUpdate} className="min-h-9 shrink-0 rounded-xl bg-emerald-500 px-4 text-xs font-black text-white">Update</button>
        </div>
      )}
    </>
  );
}
