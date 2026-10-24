import { useEffect, useState } from "react";
import apiClient from "../services/apiClient";
import { usePush } from "./usePush";

const CATS = [
  ["ESCROW", "Payments & escrow", "Top-ups, payments held and released, refunds, withdrawals"],
  ["ORDERS", "Orders", "New orders, confirmations, deliveries, cancellations"],
  ["MESSAGES", "Messages", "Someone sent you a message (never the message itself)"],
  ["SYSTEM", "Network & account", "Commissions, new team members, membership reminders"],
];

function Switch({ checked, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-emerald-600" : "bg-slate-300"} disabled:opacity-50`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export default function NotificationSettings() {
  const p = usePush();
  const [prefs, setPrefs] = useState(null);
  const [hide, setHide] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [saveError, setSaveError] = useState("");
  const [testOk, setTestOk] = useState(false);

  useEffect(() => {
    apiClient.get("/push/prefs").then(({ data }) => { setPrefs(data.prefs); setHide(data.hideDetails); setConfigured(data.configured); }).catch(() => {});
  }, []);

  const save = async (patch, revert) => {
    setSaveError("");
    try { await apiClient.patch("/push/prefs", patch); } catch { revert(); setSaveError("Couldn't save that. Please try again."); }
  };
  const toggleCat = (key, v) => { setPrefs((s) => ({ ...s, [key]: v })); save({ [key]: v }, () => setPrefs((s) => ({ ...s, [key]: !v }))); };
  const toggleHide = (v) => { setHide(v); save({ hideDetails: v }, () => setHide(!v)); };
  const sendTest = async () => { setTestOk(false); await p.test(); setTestOk(true); };

  const unavailable = !configured || !p.supported;

  return (
    <section aria-labelledby="alerts-h" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 id="alerts-h" className="text-sm font-black text-slate-900">Alerts on this device</h2>

      {!configured ? (
        <p className="mt-2 text-xs text-slate-500">Alerts aren't available yet. Please check back soon.</p>
      ) : p.needsInstall ? (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">On iPhone, alerts work after you add Sokodigi to your Home Screen: tap <b>Share</b>, then <b>Add to Home Screen</b>, and open Sokodigi from there.</p>
      ) : !p.supported ? (
        <p className="mt-2 text-xs text-slate-500">This browser can't show alerts from websites. Alerts also only work in the installed or live app, not in development.</p>
      ) : p.permission === "denied" ? (
        <p className="mt-2 rounded-xl bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-700">Alerts are blocked for Sokodigi. Open your browser's site settings, allow notifications, then come back.</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-xs text-slate-600">{p.subscribed ? "✓ Alerts are on. You'll get a notification even when Sokodigi is closed." : "Get notified about orders, payments and messages, even when the app is closed."}</p>
          {p.subscribed ? (
            <div className="flex gap-2">
              <button type="button" onClick={sendTest} disabled={p.busy} className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Send a test</button>
              <button type="button" onClick={p.disable} disabled={p.busy} className="min-h-10 rounded-xl bg-slate-100 px-3 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50">Turn off</button>
            </div>
          ) : (
            <button type="button" onClick={p.enable} disabled={p.busy} className="min-h-10 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{p.busy ? "Turning on…" : "Turn on alerts"}</button>
          )}
        </div>
      )}

      {p.error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{p.error}</p>}
      {testOk && !p.error && <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">Test sent. It should appear on this device in a few seconds.</p>}

      {prefs && !unavailable && (
        <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          {CATS.map(([key, title, text]) => (
            <div key={key} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0"><p className="text-xs font-bold text-slate-800">{title}</p><p className="text-[11px] text-slate-500">{text}</p></div>
              <Switch checked={prefs[key] !== false} onChange={(v) => toggleCat(key, v)} label={title} />
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0"><p className="text-xs font-bold text-slate-800">Hide details on the lock screen</p><p className="text-[11px] text-slate-500">Alerts just say "You have a new notification", with no amounts or names.</p></div>
            <Switch checked={hide} onChange={toggleHide} label="Hide details on the lock screen" />
          </div>
          <p className="pt-2 text-[11px] text-slate-400">These settings apply to all your devices.</p>
        </div>
      )}
      {saveError && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{saveError}</p>}
    </section>
  );
}
