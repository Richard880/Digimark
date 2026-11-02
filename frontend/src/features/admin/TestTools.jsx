import { useState } from "react";
import apiClient from "../../services/apiClient";
import useAuth from "../auth/hooks/useAuth";

const btn = "min-h-11 rounded-xl px-4 text-xs font-bold bg-slate-900 text-white disabled:opacity-50";

export default function TestTools() {
  const { auth, refreshProfile } = useAuth();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState("phase4");
  const run = async (fn, ok) => {
    setBusy(true); setMsg("");
    try { await fn(); await refreshProfile(true); setMsg(ok); } catch (e) { setMsg(e.response?.status === 404 ? "Test tools are switched off on the server." : "That failed. Check the server log."); } finally { setBusy(false); }
  };
  const post = (p, body) => () => apiClient.post(`/test-tools/${p}`, body);
  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-8">
      <p className="rounded-xl bg-red-50 px-4 py-3 text-xs font-bold text-red-800">TEST TOOLS. For testing only, and they act on your own account ({auth.user?.email}). Delete this page and switch the server flag off before launch.</p>
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4"><h2 className="text-sm font-black">1. Test wallet funds</h2>
        <div className="flex flex-wrap gap-2">{[1000, 5000, 20000].map((a) => <button key={a} type="button" disabled={busy} className={btn} onClick={() => run(post("funds", { amount: a }), `Added KES ${a}.`)}>+{a.toLocaleString()}</button>)}</div>
        <p className="text-[11px] text-slate-500">Then upgrade on the Membership page: it exercises the real payment path.</p></section>
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4"><h2 className="text-sm font-black">2. Force a plan (shortcut)</h2>
        <select className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" value={plan} onChange={(e) => setPlan(e.target.value)}>{["phase1", "phase2", "phase3", "phase4"].map((p) => <option key={p} value={p}>{p}</option>)}</select>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className={btn} onClick={() => run(post("plan", { plan, days: 30 }), `You are now on ${plan} for 30 days.`)}>Set plan, 30 days</button>
          <button type="button" disabled={busy} className={btn} onClick={() => run(post("expire"), "Membership expired: check the read-only behaviour.")}>Expire membership</button></div>
        <p className="text-[11px] text-slate-500">This skips matrix placement. For commission tests, register extra accounts under yours and pay properly.</p></section>
      {msg && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-900">{msg}</p>}
    </div>
  );
}
