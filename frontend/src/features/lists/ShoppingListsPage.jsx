import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import useAuth from "../auth/hooks/useAuth";
import ROUTES from "../../constants/routes";

const fmt = (n) => `KES ${Number(n || 0).toLocaleString("en-KE")}`;
const when = (d) => (d ? new Date(d).toLocaleString("en-KE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Not scheduled");
const field = "min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-emerald-500 focus:outline-none";
const btn = "min-h-10 rounded-xl px-3 text-xs font-bold disabled:opacity-50";
const STATUS = { draft: ["Draft", "bg-slate-200 text-slate-700"], needs_review: ["Needs your check", "bg-amber-100 text-amber-800"], active: ["Active", "bg-emerald-100 text-emerald-800"], paused: ["Paused", "bg-slate-200 text-slate-600"], done: ["Done", "bg-slate-100 text-slate-500"] };
const REASON = {
  funds: "Your wallet didn't cover the list, so nothing was ordered. Top up, check the list and start it again.", edited: "You changed the list. Check it and start it again.",
  new: "Check the list below, then start it.", resume: "Check the list below, then start it again.", missed: "The delivery time passed before the order could be placed. Pick a new time.",
  nothing: "None of the items could be ordered. Check the list.", items_skipped: "Some items were skipped last time (out of stock, or the price went up). Check them.",
};
const ITEM = { ok: ["Available", "text-emerald-700"], out_of_stock: ["Out of stock", "text-red-600"], price_up: ["Price went up: verify to continue", "text-amber-700"], unavailable: ["No longer available", "text-red-600"], no_vendor: ["No shop near you has it", "text-red-600"] };
const REPEAT = [["none", "Just once"], ["daily", "Every day"], ["weekly", "Every week"], ["biweekly", "Every 2 weeks"], ["monthly", "Every month"]];
const ERR = {
  DELIVERY_TOO_SOON: "Choose a time at least 25 hours from now.", INVALID_TIME: "Choose a time between 6:00 and 21:00, within 90 days.", INVALID_ADDRESS: "Check your name, phone, county and sub-county.",
  CONSENT_REQUIRED: "Tick the box to allow the orders.", PRICE_CHANGED: "A price changed while you were looking. Review again.", NOTHING_ORDERABLE: "None of the items can be ordered right now.",
  AUTO_NEEDS_BARCODE: "“Pick for me” only works for items with a barcode.", NO_SCHEDULE: "Set the delivery time and address first.", TOO_MANY_REQUESTS: "You're going too fast. Wait a moment.",
  LIST_LIMIT: "You have 10 lists already.", CANNOT_RESUME: "This list can't be resumed.",
};
const errMsg = (e) => (!e.response ? "Couldn't reach Sokodigi. Check your connection." : ERR[e.response.data?.error] || "Something went wrong. Please try again.");
const toLocalInput = (d) => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

function ListSheet({ id, onClose, onChanged }) {
  const { auth } = useAuth();
  const p = auth.profile || {};
  const [d, setD] = useState(null);
  const [edits, setEdits] = useState({});
  const [sched, setSched] = useState(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/lists/${id}`);
      setD(data);
      setEdits(Object.fromEntries(data.list.items.map((i) => [i.id, { quantity: i.quantity, mode: i.mode }])));
      setSched({
        when: toLocalInput(data.list.deliveryAt), repeat: data.list.repeat,
        fullName: data.list.address?.fullName || [p.firstName, p.lastName].filter(Boolean).join(" "),
        phone: data.list.address?.phoneNumber ? `0${data.list.address.phoneNumber.slice(3)}` : p.phoneNumber ? `0${String(p.phoneNumber).slice(3)}` : "",
        county: data.list.address?.county || p.location?.county || "", subCounty: data.list.address?.subCounty || p.location?.subCounty || "", notes: data.list.address?.deliveryNotes || "",
      });
    } catch (e) { setMsg(errMsg(e)); }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  const act = async (fn, ok) => { setBusy(true); setMsg(""); try { await fn(); if (ok) setMsg(ok); await load(); onChanged(); } catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); } };

  if (!d || !sched) return <Shell title="Shopping list" onClose={onClose}><p className="py-6 text-center text-xs text-slate-500">{msg || "Loading…"}</p></Shell>;
  const { list, review: rv } = d;
  const [label, tone] = STATUS[list.status];
  const rowOf = Object.fromEntries(rv.rows.map((r) => [r.itemId, r]));
  const dirty = list.items.some((i) => edits[i.id]?.quantity !== i.quantity || edits[i.id]?.mode !== i.mode);
  const setE = (i, k, v) => setEdits((s) => ({ ...s, [i]: { ...s[i], [k]: v } }));
  const scheduled = !!list.deliveryAt;

  const saveItems = () => act(() => apiClient.put(`/lists/${id}`, { items: list.items.map((i) => ({ id: i.id, ...edits[i.id] })) }), "Saved.");
  const saveSchedule = () => act(() => apiClient.put(`/lists/${id}/schedule`, {
    deliveryAt: sched.when ? new Date(sched.when).toISOString() : null, repeat: sched.repeat,
    address: { fullName: sched.fullName, phoneNumber: sched.phone, county: sched.county, subCounty: sched.subCounty, deliveryNotes: sched.notes },
  }), "Schedule saved. Check the list below and start it.");
  const confirm = (drop = []) => act(() => apiClient.post(`/lists/${id}/confirm`, { consent: true, dropItemIds: drop, expect: Object.fromEntries(rv.rows.filter((r) => r.unitPrice != null).map((r) => [r.itemId, r.unitPrice])) }), "Your list is active.");
  const set = (k) => (e) => setSched((s) => ({ ...s, [k]: e.target.value }));
  const minWhen = toLocalInput(new Date(Date.now() + 25 * 3600000));

  return (
    <Shell title={list.name} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${tone}`}>{label}</span><span className="text-xs text-slate-500">{list.repeat !== "none" ? `${REPEAT.find((r) => r[0] === list.repeat)[1]} · ` : ""}{when(list.deliveryAt)}</span></div>
        {REASON[list.reason] && <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{REASON[list.reason]}</p>}
        {msg && <p role="status" className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{msg}</p>}

        <section aria-label="Items">
          <h4 className="mb-1 text-xs font-black uppercase text-slate-500">Items</h4>
          {list.items.length === 0 ? <p className="text-xs text-slate-500">No items yet. Open a product and tap “Add to shopping list”.</p> : (
            <ul className="divide-y divide-slate-100">{list.items.map((i) => {
              const r = rowOf[i.id], e = edits[i.id] || {};
              const [st, stTone] = ITEM[r?.status] || ["", ""];
              return (
                <li key={i.id} className="space-y-1.5 py-3">
                  <div className="flex items-start justify-between gap-2"><p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{r?.name || i.name}</p>
                   <button type="button" aria-label={`Remove ${i.name}`} className="px-1 text-slate-400"
                            onClick={() => act(() => apiClient.put(`/lists/${id}`, 
                                                                   { items: list.items.filter((x) => x.id !== i.id).map((x) => 
                                                                     ({ id: x.id, ...edits[x.id] }))
                                                                   }))}>✕</button></div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center overflow-hidden rounded-xl border border-slate-200">
                      <button type="button" aria-label="Less" onClick={() => setE(i.id, "quantity", Math.max(1, (e.quantity || 1) - 1))} className="h-10 w-10 bg-slate-50 font-bold">−</button>
                      <span className="w-9 text-center text-sm font-black">{e.quantity}</span>
                      <button type="button" aria-label="More" onClick={() => setE(i.id, "quantity", Math.min(100, (e.quantity || 1) + 1))} className="h-10 w-10 bg-slate-50 font-bold">+</button>
                    </div>
                    <select aria-label={`Shop for ${i.name}`} value={e.mode} onChange={(ev) => setE(i.id, "mode", ev.target.value)} className="min-h-10 rounded-xl border border-slate-200 px-2 text-xs font-bold">
                      <option value="this_vendor">This shop</option>
                      <option value="auto" disabled={!i.barcode}>Pick for me{!i.barcode ? " (no barcode)" : ""}</option>
                    </select>
                    {r?.unitPrice != null && <span className="ml-auto text-sm font-black">{fmt(r.lineTotal)}</span>}
                  </div>
                  <p className={`text-[11px] font-bold ${stTone}`}>{st}{r?.sellerName ? <span className="font-normal text-slate-500"> · {r.sellerName}</span> : null}
                    {i.mode === "auto" && r?.sellerId && <button type="button" onClick={() => act(() => apiClient.post(`/lists/${id}/block`, { sellerId: r.sellerId }), "That shop won't be used for this list.")} className="ml-2 font-bold text-red-600 underline">Don't use this shop</button>}</p>
                </li>
              );
            })}</ul>
          )}
          {dirty && <button type="button" disabled={busy} onClick={saveItems} className={`${btn} mt-2 w-full bg-emerald-700 text-white`}>Save changes</button>}
        </section>

        <section aria-label="Delivery" className="space-y-2 rounded-2xl border border-slate-200 p-3">
          <h4 className="text-xs font-black uppercase text-slate-500">When and where</h4>
          <input type="datetime-local" className={field} aria-label="Delivery time" min={minWhen} value={sched.when} onChange={set("when")} />
          <select className={field} aria-label="Repeat" value={sched.repeat} onChange={set("repeat")}>{REPEAT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <input className={field} placeholder="Full name" aria-label="Full name" value={sched.fullName} onChange={set("fullName")} />
          <input className={field} type="tel" placeholder="Phone for the delivery person" aria-label="Phone" value={sched.phone} onChange={set("phone")} />
          <div className="grid grid-cols-2 gap-2"><input className={field} placeholder="County" aria-label="County" value={sched.county} onChange={set("county")} /><input className={field} placeholder="Sub-county" aria-label="Sub-county" value={sched.subCounty} onChange={set("subCounty")} /></div>
          <input className={field} placeholder="Landmark or notes (optional)" aria-label="Notes" maxLength={300} value={sched.notes} onChange={set("notes")} />
          <p className="text-[11px] text-slate-500">Delivery times are between 6:00 and 21:00. The order is placed 24 hours earlier, and your money is held safely in escrow until you confirm delivery.</p>
          <button type="button" disabled={busy || !sched.when} onClick={saveSchedule} className={`${btn} w-full border border-slate-200 text-slate-700`}>Save time and address</button>
        </section>

        <section aria-label="Review" className="space-y-2 rounded-2xl bg-emerald-50 p-3">
          <div className="flex items-baseline justify-between"><span className="text-xs font-bold text-emerald-900">Would be ordered now</span><span className="text-lg font-black text-emerald-900">{fmt(rv.total)}</span></div>
          <p className={`text-xs font-semibold ${rv.short > 0 ? "text-red-700" : "text-emerald-800"}`}>Wallet {fmt(rv.wallet.balance)}{rv.short > 0 && <> · {fmt(rv.short)} short. <Link to={ROUTES.WALLET} className="underline">Top up</Link></>}</p>
          {rv.rows.some((r) => r.status !== "ok") && <p className="text-[11px] text-slate-600">Items that aren't available are skipped when ordering. You can remove them above.</p>}
          {list.status !== "active" && (
            <>
              <label className="flex items-start gap-2.5 text-xs text-slate-700"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-700" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>I allow Sokodigi to place these orders from my wallet at the times shown. I can pause or delete this list at any time.</span></label>
              <button type="button" disabled={busy || dirty || !consent || !scheduled || list.status === "done"} onClick={() => confirm()} className={`${btn} w-full bg-emerald-700 text-white`}>{busy ? "Working…" : list.status === "paused" ? "Resume" : "Verify and start"}</button>
              {dirty && <p className="text-[11px] text-amber-800">Save your changes first.</p>}
              {!scheduled && <p className="text-[11px] text-amber-800">Save a delivery time and address first.</p>}
            </>
          )}
        </section>

        <div className="flex flex-wrap gap-2">
          {list.status === "active" && <button type="button" disabled={busy} onClick={() => act(() => apiClient.post(`/lists/${id}/pause`))} className={`${btn} border border-slate-200 text-slate-700`}>Pause</button>}
          {list.status === "paused" && <button type="button" disabled={busy} onClick={() => act(() => apiClient.post(`/lists/${id}/resume`))} className={`${btn} border border-slate-200 text-slate-700`}>Check and resume</button>}
          <button type="button" disabled={busy} onClick={() => window.confirm("Delete this list? Orders already placed are not affected.") && act(() => apiClient.delete(`/lists/${id}`)).then(onClose)} className={`${btn} bg-red-50 text-red-700`}>Delete list</button>
        </div>
        {list.lastRun?.at && <p className="text-[11px] text-slate-500">Last run {when(list.lastRun.at)}: {list.lastRun.placed.length} ordered{list.lastRun.skipped.length ? `, ${list.lastRun.skipped.length} skipped` : ""}.</p>}
      </div>
    </Shell>
  );
}

function Shell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between"><h3 className="truncate text-base font-black text-slate-900">{title}</h3><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export default function ShoppingListsPage() {
  const [lists, setLists] = useState(null);
  const [open, setOpen] = useState(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => apiClient.get("/lists").then(({ data }) => setLists(data.lists)).catch(() => setLists([])), []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault(); setError("");
    try { const { data } = await apiClient.post("/lists", { name: name.trim() }); setName(""); await load(); setOpen(data.id); } catch (x) { setError(errMsg(x)); }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-5 sm:px-6">
      <h1 className="text-2xl font-black text-slate-900">Shopping lists</h1>
      <p className="mt-1 text-sm text-slate-600">Save what you buy often, choose when you want it delivered, and let Sokodigi place the order for you. Keep money in your wallet and wait for delivery. You can pause or stop a list at any time.</p>
      <form onSubmit={create} className="mt-4 flex gap-2"><input className={field} placeholder="New list name, e.g. Monthly groceries" aria-label="New list name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /><button type="submit" disabled={!name.trim()} className={`${btn} shrink-0 bg-emerald-700 text-white`}>Create</button></form>
      {error && <p role="alert" className="mt-2 text-xs font-bold text-red-600">{error}</p>}

      {lists === null ? <div className="mt-4 h-32 animate-pulse rounded-2xl bg-slate-100" />
        : lists.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-xs text-slate-500">No lists yet. Create one, then add products from any product page.</p>
        : (
          <ul className="mt-4 space-y-3">{lists.map((l) => { const [label, tone] = STATUS[l.status]; return (
            <li key={l.id}><button type="button" onClick={() => setOpen(l.id)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-emerald-300">
              <div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{l.name}</p><p className="text-xs text-slate-500">{l.items.length} item{l.items.length === 1 ? "" : "s"} · {l.deliveryAt ? when(l.deliveryAt) : "Not scheduled"}</p></div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${tone}`}>{label}</span>
            </button></li>); })}</ul>)}
      {open && <ListSheet id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
