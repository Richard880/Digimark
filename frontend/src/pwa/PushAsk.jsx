import { useState } from "react";
import useAuth from "../features/auth/hooks/useAuth";
import { usePush } from "./usePush";

const KEY = "sokodigi_push_ask_snooze";
const snoozed = () => { try { return Date.now() < Number(localStorage.getItem(KEY) || 0); } catch { return true; } };
const snooze = (days) => { try { localStorage.setItem(KEY, String(Date.now() + days * 86400000)); } catch { /* ignore */ } };

export default function PushAsk({ reason }) {
  const { auth } = useAuth();
  const p = usePush();
  const [hidden, setHidden] = useState(snoozed);
  const [done, setDone] = useState(false);

  if (done) return <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">✓ Alerts are on.</p>;
  if (!auth.authenticated || hidden || !p.supported || p.needsInstall || p.permission !== "default") return null;

  const turnOn = async () => { await p.enable(); if (Notification.permission === "granted") setDone(true); else if (Notification.permission === "denied") setHidden(true); };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <span className="text-2xl" aria-hidden="true">🔔</span>
      <p className="min-w-0 flex-1 text-xs font-semibold text-emerald-900">{reason}</p>
      <div className="flex gap-2">
        <button type="button" onClick={turnOn} disabled={p.busy} className="min-h-10 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{p.busy ? "…" : "Turn on alerts"}</button>
        <button type="button" onClick={() => { snooze(14); setHidden(true); }} className="min-h-10 rounded-xl px-3 text-xs font-bold text-slate-500 hover:bg-white">Not now</button>
      </div>
      {p.error && <p role="alert" className="w-full text-xs font-semibold text-red-700">{p.error}</p>}
    </div>
  );
}
