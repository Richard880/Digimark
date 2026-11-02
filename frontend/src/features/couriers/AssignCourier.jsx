import { useEffect, useState } from "react";
import apiClient from "../../services/apiClient";

const field = "min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-emerald-500 focus:outline-none";
const ERR = { ORDER_NOT_ASSIGNABLE: "Couriers can be assigned once the order is confirmed and on its way.", COURIER_NOT_FOUND: "That courier is no longer registered.", TOO_MANY_REQUESTS: "You're going too fast. Wait a moment." };

export default function AssignCourier({ order, onChanged }) {
  const [list, setList] = useState(null);
  const [pick, setPick] = useState(order.courier?.memberId || "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { apiClient.get("/couriers/mine").then(({ data }) => setList(data.couriers.filter((c) => c.status === "active"))).catch(() => setList([])); }, []);
  if (list === null || list.length === 0) return list && <p className="mt-2 text-[11px] text-slate-500">Register couriers in Team → Couriers to show buyers who is delivering.</p>;

  const save = async () => {
    setBusy(true); setMsg(null);
    try { await apiClient.post("/couriers/assign", { orderNumber: order.orderNumber, courierId: pick || null, feeNote: note.trim() }); setMsg({ ok: true, t: pick ? "Courier assigned. The buyer was told." : "Courier removed." }); onChanged?.(); }
    catch (e) { setMsg({ ok: false, t: e.response ? ERR[e.response.data?.error] || "Something went wrong." : "Couldn't reach Sokodigi." }); } finally { setBusy(false); }
  };
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-slate-200 p-3">
      <p className="text-[11px] font-black uppercase text-slate-500">Courier</p>
      <select className={field} aria-label="Courier" value={pick} onChange={(e) => setPick(e.target.value)}>
        <option value="">No courier</option>
        {list.map((c) => <option key={c._id} value={c._id}>{c.name} · {c.vehicleType.replace("_", " ")}{c.plate ? ` · ${c.plate}` : ""}</option>)}
      </select>
      {pick && <input className={field} placeholder="Fee note for the courier (private, optional)" aria-label="Fee note" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} />}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-xs font-bold ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}
      <button type="button" onClick={save} disabled={busy || (pick === (order.courier?.memberId || "") && !note)} className="min-h-10 w-full rounded-xl bg-slate-900 text-xs font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Save courier"}</button>
    </div>
  );
}
