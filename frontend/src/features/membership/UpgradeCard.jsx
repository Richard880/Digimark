import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import useEntitlements from "./useEntitlements";
import ROUTES from "../../constants/routes";

const fmt = (n) => `Ksh ${Number(n || 0).toLocaleString("en-KE")}`;
const FEATURES = [
  ["pos", "POS and counter sales"], 
  ["export", "Inventory export (CSV)"], 
  ["stockHistory", "Stock history"], 
  ["lowStockInApp", "Low-stock alerts in the app"],
  ["promoteOthers", "Promote others' products (5% bonus)"], 
  ["barcodes", "Barcode scanning"], 
  ["thermalPrint", "Thermal receipt printing"],
  ["customers", "Customers and credit sales"], 
  ["suppliers", "Suppliers and purchase orders"], 
  ["profitReports", "Profit reports"],
  ["lowStockSms", "Low-stock SMS"],
  ["receiptsPdf", "Receipts (print, PDF, WhatsApp)"],
  ["dailyReport", "Daily report and cash close"],
  ["multiTerminal", "Several POS devices"],
  ["staffRoles", "Staff logins and roles"], 
  ["multiBranch", "Several branches"],
  ["apiAccess", "API and accounting export"],
  ["prioritySync", "Priority offline sync"], 
  ["prioritySupport", "Priority support"],
];
const ERR = {
  INSUFFICIENT_FUNDS: "Your wallet balance is too low for this upgrade.", UPGRADE_NOT_AVAILABLE: "That upgrade isn't available right now.",
  PLAN_CHANGED_RETRY: "Your plan just changed. Refreshing.", TOO_MANY_REQUESTS: "You're going too fast. Wait a moment.",
  NETWORK_ERROR: "Couldn't confirm the upgrade. Check your wallet before trying again: if it dropped, the upgrade went through.",
};

export default function UpgradeCard({ onChanged }) {
  const { ent, refresh } = useEntitlements();
  const [plans, setPlans] = useState([]);
  const [built, setBuilt] = useState([]);
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const key = useRef(null);

  useEffect(() => { apiClient.get("/membership/plans").then(({ data }) => { setPlans(data.plans || []); setBuilt(data.built || []); }).catch(() => {}); }, []);
  useEffect(() => { key.current = null; }, [target]);
  if (!ent || !ent.active || plans.length === 0) return null;

  const upgrade = async () => {
    if (busy || !target) return;
    setBusy(true); setError("");
    if (!key.current) key.current = crypto.randomUUID().replace(/-/g, "");
    try {
      await apiClient.post("/membership/upgrade", { plan: target.plan }, { headers: { "Idempotency-Key": key.current } });
      key.current = null; setDone(target.name); setTarget(null);
      await refresh(); onChanged?.();
    } catch (e) {
      if (e.response) key.current = null;
      setError(e.response ? ERR[e.response.data?.error] || "Something went wrong. Please try again." : ERR.NETWORK_ERROR);
    } finally { setBusy(false); }
  };

  const cell = (p, f) => (p.features[f] ? <span className={built.includes(f) ? "font-black text-emerald-700" : "text-slate-400"}>{built.includes(f) ? "✓" : "soon"}</span> : <span className="text-slate-300">–</span>);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="plans-compare">
      <h2 id="plans-compare" className="text-sm font-black text-slate-800">Compare plans</h2>
      <p className="mb-3 text-[11px] text-slate-500">You're on <b>{ent.name}</b>. Upgrade any time and pay only the difference for the days left. Downgrades happen when you renew. Features marked “soon” are being built.</p>
      {done && <p role="status" className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">You're now on {done}.</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead><tr className="text-[11px] text-slate-500"><th className="pb-2 pr-2 font-bold">&nbsp;</th>{plans.map((p) => <th key={p.key} className={`pb-2 text-center ${p.key === ent.planKey ? "text-emerald-800" : ""}`}>{p.name}<br /><span className="font-black text-slate-900">{fmt(p.fee)}</span></th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            <tr><td className="py-2 pr-2 font-semibold text-slate-700">Products</td>{plans.map((p) => <td key={p.key} className="text-center font-bold">{p.limits.products.toLocaleString("en-KE")}</td>)}</tr>
            <tr><td className="py-2 pr-2 font-semibold text-slate-700">Network levels earned</td>{plans.map((p) => <td key={p.key} className="text-center font-bold">{p.earnDepth === 1 ? "Level 1" : `Levels 1–${p.earnDepth}`}</td>)}</tr>
            <tr><td className="py-2 pr-2 font-semibold text-slate-700">SMS a month</td>{plans.map((p) => <td key={p.key} className="text-center font-bold">{p.limits.smsPerMonth || "–"}</td>)}</tr>
            {FEATURES.map(([f, label]) => <tr key={f}><td className="py-2 pr-2 text-slate-700">{label}</td>{plans.map((p) => <td key={p.key} className="text-center">{cell(p, f)}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      {ent.upgrades.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {ent.upgrades.map((u) => <button key={u.plan} type="button" onClick={() => { setTarget(u); setError(""); }} className="min-h-11 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white hover:bg-emerald-800">Upgrade to {u.name} · {fmt(u.amount)}</button>)}
        </div>
      )}
      {target && (
        <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-900/60 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Confirm upgrade">
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-black text-slate-900">Upgrade to {target.name}</h3>
            <p className="text-sm text-slate-600">Pay <b>{fmt(target.amount)}</b> from your wallet now: the difference for the rest of this billing period. Your next renewal is at the new plan's price.</p>
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">Upgrade payments aren't refundable and don't earn network commissions for anyone.</p>
            {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error} {error === ERR.INSUFFICIENT_FUNDS && <Link to={ROUTES.WALLET} className="underline">Top up</Link>}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setTarget(null)} disabled={busy} className="min-h-11 flex-1 rounded-xl bg-slate-100 text-sm font-bold text-slate-700">Cancel</button>
              <button type="button" onClick={upgrade} disabled={busy} className="min-h-11 flex-1 rounded-xl bg-emerald-700 text-sm font-black text-white disabled:opacity-50">{busy ? "Upgrading…" : `Pay ${fmt(target.amount)}`}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
