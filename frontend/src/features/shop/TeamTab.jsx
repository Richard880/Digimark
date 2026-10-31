import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import ROUTES from "../../constants/routes";
import useShop from "./useShop";
import { Sheet, Err, field, btn, errMsg, when, ROLE } from "./ui";

const BLURB = { manager: "Sells, changes prices, voids sales, runs reports, manages stock.", cashier: "Sells at catalogue prices and takes customer payments.", stock_clerk: "Counts, adjusts and transfers stock." };

function InviteSheet({ shop, onClose, onDone }) {
  const [role, setRole] = useState("cashier");
  const [branchIds, setBranchIds] = useState([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState(null);
  const toggle = (id) => setBranchIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const submit = async (e) => {
    e.preventDefault();
    if (role !== "manager" && !branchIds.length) return setError("Choose at least one branch.");
    setBusy(true); setError("");
    try { const { data } = await apiClient.post("/shop/staff/invites", { role, branchIds, label: label.trim() }); setMade(data); onDone(); }
    catch (x) { setError(errMsg(x)); } finally { setBusy(false); }
  };
  const msg = made ? `Join ${shop.ownerName} on Sokodigi. Sign in, open your profile, tap "Join a shop" and enter this code: ${made.code} (valid for 3 days).` : "";
  return (
    <Sheet title="Invite a team member" onClose={busy ? () => {} : onClose}>
      {made ? (
        <div className="space-y-3 text-center">
          <p className="text-xs text-slate-600">Give this code to your team member. It works once and expires in 3 days. <b>It's shown only now.</b></p>
          <p className="rounded-2xl bg-emerald-50 py-4 font-mono text-3xl font-black tracking-widest text-emerald-900">{made.code}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => navigator.clipboard?.writeText(made.code)} className={`${btn} border border-slate-200 text-slate-700`}>Copy code</button>
            <button type="button" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener")} className={`${btn} border border-slate-200 text-slate-700`}>Send on WhatsApp</button>
          </div>
          <button type="button" onClick={onClose} className={`${btn} w-full bg-emerald-700 text-white`}>Done</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input className={field} placeholder="Their name (optional, for your list)" aria-label="Name" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} />
          <div className="space-y-2" role="radiogroup" aria-label="Role">{["cashier", "manager", "stock_clerk"].map((r) => (
            <label key={r} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 ${role === r ? "border-emerald-600 bg-emerald-50" : "border-slate-200"}`}>
              <input type="radio" className="mt-1 accent-emerald-700" checked={role === r} onChange={() => setRole(r)} /><span><b className="block text-sm text-slate-900">{ROLE[r]}</b><span className="text-[11px] text-slate-500">{BLURB[r]}</span></span></label>))}</div>
          <div><p className="mb-1 text-[11px] font-bold uppercase text-slate-500">Branches {role === "manager" && "(none = all)"}</p>
            <div className="flex flex-wrap gap-2">{shop.branches.map((b) => <button key={b._id} type="button" aria-pressed={branchIds.includes(b._id)} onClick={() => toggle(b._id)} className={`rounded-full px-4 py-2 text-xs font-bold ${branchIds.includes(b._id) ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-600"}`}>{b.name}</button>)}</div></div>
          <Err text={error} />
          <button type="submit" disabled={busy} className={`${btn} w-full bg-emerald-700 text-white`}>{busy ? "Creating…" : "Create invite code"}</button>
        </form>
      )}
    </Sheet>
  );
}

const Locked = ({ icon, title, text }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"><p className="text-3xl" aria-hidden="true">{icon}</p><h3 className="mt-1 text-sm font-black text-slate-900">{title}</h3><p className="mx-auto mt-1 max-w-sm text-xs text-slate-600">{text}</p>
    <Link to={ROUTES.MEMBERSHIP} className="mt-3 inline-block min-h-10 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-black text-white">Compare plans</Link></div>
);

export default function TeamTab() {
  const { shop, ent } = useShop();
  const [staff, setStaff] = useState([]);
  const [devices, setDevices] = useState([]);
  const [log, setLog] = useState([]);
  const [invite, setInvite] = useState(false);
  const [msg, setMsg] = useState("");

  const f = ent?.features || {};
  const loadStaff = useCallback(() => { if (f.staffRoles) apiClient.get("/shop/staff").then(({ data }) => setStaff(data.staff)).catch(() => {}); }, [f.staffRoles]);
  const loadDevices = useCallback(() => { if (f.multiTerminal) apiClient.get("/shop/terminals").then(({ data }) => setDevices(data.terminals)).catch(() => {}); }, [f.multiTerminal]);
  useEffect(() => { loadStaff(); loadDevices(); if (f.auditLog) apiClient.get("/shop/audit").then(({ data }) => setLog(data.items)).catch(() => {}); }, [loadStaff, loadDevices, f.auditLog]);
  if (!shop || !ent) return null;

  const names = Object.fromEntries(shop.allBranches.map((b) => [b._id, b.name]));
  const act = async (fn) => { setMsg(""); try { await fn(); loadStaff(); loadDevices(); } catch (e) { setMsg(errMsg(e)); } };
  const changeRole = (s) => { const r = window.prompt("Role: manager, cashier or stock_clerk", s.role); if (r && r !== s.role) act(() => apiClient.patch(`/shop/staff/${s._id}`, { role: r.trim() })); };
  const remove = (s) => window.confirm(`Remove ${s.displayName || s.label || "this person"}? They lose access straight away.`) && act(() => apiClient.patch(`/shop/staff/${s._id}`, { remove: true }));

  return (
    <section className="space-y-5" aria-label="Team">
      <div><h2 className="text-lg font-black text-slate-900">Team</h2><p className="text-xs text-slate-500">Staff logins, devices and what they've done.</p></div>
      {msg && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{msg}</p>}

      {!f.staffRoles ? <Locked icon="👥" title="Staff logins" text="Give cashiers, managers and stock clerks their own logins with limited access. Available from Smart-Hub (KSh 500 a month)." /> : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-black text-slate-800">Staff ({staff.length} of {ent.limits.staff})</h3><button type="button" onClick={() => setInvite(true)} className={`${btn} bg-emerald-700 text-white`}>+ Invite</button></div>
          {staff.length === 0 ? <p className="py-4 text-center text-xs text-slate-500">No staff yet.</p> : (
            <ul className="divide-y divide-slate-100 text-xs">{staff.map((s) => (
              <li key={s._id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0"><p className="font-black text-slate-900">{s.displayName || s.label || "Invited"} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{ROLE[s.role]}</span>{s.status === "invited" && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Waiting to join</span>}</p>
                  <p className="text-slate-500">{s.branchIds.length ? s.branchIds.map((id) => names[id] || "branch").join(", ") : "All branches"}</p></div>
                <div className="flex gap-3 font-bold"><button type="button" onClick={() => changeRole(s)} className="text-emerald-700 underline">Change role</button><button type="button" onClick={() => remove(s)} className="text-red-600 underline">Remove</button></div>
              </li>))}</ul>)}
        </div>
      )}

      {!f.multiTerminal ? <Locked icon="🖥️" title="Several POS devices" text="Sell from more than one phone or till at the same time. Available from Smart-Hub." /> : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-black text-slate-800">Devices ({devices.filter((d) => d.status === "active").length} of {ent.limits.terminals})</h3>
          <p className="mb-2 text-[11px] text-slate-500">A device appears here the first time someone opens the POS on it. Removing a device blocks new sales from it.</p>
          {devices.length === 0 ? <p className="py-3 text-center text-xs text-slate-500">No devices yet.</p> : (
            <ul className="divide-y divide-slate-100 text-xs">{devices.map((d) => (
              <li key={d._id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0"><p className="font-black text-slate-900">{d.name} {d.status === "revoked" && <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px]">Removed</span>}</p><p className="text-slate-500">{names[d.branchId] || "Branch"} · last seen {d.lastSeenAt ? when(d.lastSeenAt) : "never"}</p></div>
                <div className="flex gap-3 font-bold">
                  <button type="button" onClick={() => { const n = window.prompt("Device name", d.name); if (n && n.trim()) act(() => apiClient.patch(`/shop/terminals/${d._id}`, { name: n.trim() })); }} className="text-emerald-700 underline">Rename</button>
                  {d.status === "active" ? <button type="button" onClick={() => window.confirm("Remove this device? It can't make new sales.") && act(() => apiClient.patch(`/shop/terminals/${d._id}`, { status: "revoked" }))} className="text-red-600 underline">Remove</button>
                    : <button type="button" onClick={() => act(() => apiClient.patch(`/shop/terminals/${d._id}`, { status: "active" }))} className="text-emerald-700 underline">Allow again</button>}
                </div>
              </li>))}</ul>)}
        </div>
      )}

      {!f.auditLog ? <Locked icon="📜" title="Activity log" text="See who sold, voided, adjusted stock or changed staff, and when. Available from Smart-Hub." /> : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-black text-slate-800">Recent activity</h3>
          {log.length === 0 ? <p className="py-3 text-center text-xs text-slate-500">Nothing yet.</p> : (
            <ul className="divide-y divide-slate-100 text-xs">{log.map((a) => <li key={a._id} className="py-2.5"><p className="font-bold text-slate-800">{a.actorName} <span className="font-normal text-slate-500">({ROLE[a.role] || a.role})</span> · {a.action.replace(/_/g, " ")}</p><p className="text-slate-500">{a.detail} · {when(a.createdAt)}</p></li>)}</ul>)}
        </div>
      )}
      {invite && <InviteSheet shop={shop} onClose={() => setInvite(false)} onDone={loadStaff} />}
    </section>
  );
}
