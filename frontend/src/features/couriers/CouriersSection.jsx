import { useCallback, useEffect, useState } from "react";
import apiClient from "../../services/apiClient";
import { Sheet, Err, field, btn, when } from "../shop/ui";

const VEHICLE = { motorcycle: "Motorcycle", car: "Car", van: "Van", bicycle: "Bicycle", on_foot: "On foot" };

export default function CouriersSection() {
  const [list, setList] = useState([]);
  const [invite, setInvite] = useState(null); // null | "form" | { code }
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => apiClient.get("/couriers/mine").then(({ data }) => setList(data.couriers)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const make = async (e) => {
    e.preventDefault(); setError("");
    try { const { data } = await apiClient.post("/couriers/invites", { label: label.trim() }); setInvite({ code: data.code }); setLabel(""); load(); }
    catch (x) { setError(x.response?.data?.error === "COURIER_LIMIT" ? "You can have up to 10 couriers." : "Couldn't create the invite. Please try again."); }
  };
  const remove = async (c) => { if (window.confirm(`Remove ${c.name || c.label || "this courier"}? They're taken off any open orders.`)) { try { await apiClient.patch(`/couriers/${c._id}`); load(); } catch { setError("Couldn't remove them. Try again."); } } };
  const msg = invite?.code ? `Join ${"our shop"} as a courier on Sokodigi. Sign in, add a profile photo, open your profile, tap "Deliver for a shop" and enter this code: ${invite.code} (valid for 3 days).` : "";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-black text-slate-800">Couriers ({list.filter((c) => c.status === "active").length})</h3><button type="button" onClick={() => { setError(""); setInvite("form"); }} className={`${btn} bg-emerald-700 text-white`}>+ Invite</button></div>
      <p className="mb-2 text-[11px] text-slate-500">Couriers must be Sokodigi members. Buyers see their photo, vehicle and plate. You pay them yourself: Sokodigi doesn't handle courier payments.</p>
      {list.length === 0 ? <p className="py-3 text-center text-xs text-slate-500">No couriers yet.</p> : (
        <ul className="divide-y divide-slate-100 text-xs">{list.map((c) => (
          <li key={c._id} className="flex items-center justify-between gap-2 py-3">
            <div className="min-w-0"><p className="font-black text-slate-900">{c.name || c.label || "Invited"}{c.status === "invited" && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Waiting to join</span>}</p>
              <p className="text-slate-500">{c.status === "active" ? `${VEHICLE[c.vehicleType] || ""}${c.plate ? ` · ${c.plate}` : ""}` : `Code expires ${when(c.codeExpiresAt)}`}</p></div>
            <button type="button" onClick={() => remove(c)} className="font-bold text-red-600 underline">Remove</button>
          </li>))}</ul>)}
      <Err text={invite === null ? error : ""} />
      {invite === "form" && <Sheet title="Invite a courier" onClose={() => setInvite(null)}><form onSubmit={make} className="space-y-3">
        <input className={field} placeholder="Their name (optional, for your list)" aria-label="Name" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} />
        <p className="text-[11px] text-slate-500">They need a Sokodigi account with a profile photo.</p><Err text={error} />
        <button type="submit" className={`${btn} w-full bg-emerald-700 text-white`}>Create invite code</button></form></Sheet>}
      {invite?.code && <Sheet title="Invite code" onClose={() => setInvite(null)}><div className="space-y-3 text-center">
        <p className="text-xs text-slate-600">Give this code to your courier. It works once and expires in 3 days. <b>It's shown only now.</b></p>
        <p className="rounded-2xl bg-emerald-50 py-4 font-mono text-3xl font-black tracking-widest text-emerald-900">{invite.code}</p>
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => navigator.clipboard?.writeText(invite.code)} className={`${btn} border border-slate-200 text-slate-700`}>Copy code</button>
          <button type="button" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener")} className={`${btn} border border-slate-200 text-slate-700`}>Send on WhatsApp</button></div>
        <button type="button" onClick={() => setInvite(null)} className={`${btn} w-full bg-emerald-700 text-white`}>Done</button></div></Sheet>}
    </div>
  );
}
