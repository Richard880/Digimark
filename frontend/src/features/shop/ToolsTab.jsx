import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import useAuth from "../auth/hooks/useAuth";
import ROUTES from "../../constants/routes";
import { uploadImageToCloudinary } from "../../utils/cloudinaryUploader";
import useShop from "./useShop";
import { Sheet, Err, field, btn, errMsg, when } from "./ui";

const today = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
const monthAgo = () => new Date(Date.now() + 3 * 3600 * 1000 - 30 * 86400000).toISOString().slice(0, 10);
const Locked = ({ title, text }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm"><h3 className="text-sm font-black text-slate-900">{title}</h3><p className="mx-auto mt-1 max-w-sm text-xs text-slate-600">{text}</p>
    <Link to={ROUTES.MEMBERSHIP} className="mt-3 inline-block min-h-10 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-black text-white">Compare plans</Link></div>);

function Exports() {
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const get = async (kind) => {
    setBusy(kind); setError("");
    try {
      const { data } = await apiClient.get(`/shop/export/${kind}`, { params: { from, to }, responseType: "blob" });
      const url = URL.createObjectURL(data); const a = document.createElement("a");
      a.href = url; a.download = `sokodigi-${kind}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e.response?.status === 400 ? "Choose valid dates, at most one year apart." : "Couldn't export right now. Please try again."); } finally { setBusy(""); }
  };
  const items = [["sales", "Sales (one row per item sold)"], ["daily", "Daily totals by branch"], ["ledger", "Customer credit ledger"], ["stock", "Stock valuation (today)"]];
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-black text-slate-800">Accounting exports</h3>
      <p className="text-[11px] text-slate-500">CSV files you can open in Excel or import into QuickBooks or Zoho. They are not KRA tax invoices.</p>
      <div className="grid grid-cols-2 gap-2"><input type="date" className={field} aria-label="From" value={from} max={today()} onChange={(e) => setFrom(e.target.value)} /><input type="date" className={field} aria-label="To" value={to} max={today()} onChange={(e) => setTo(e.target.value)} /></div>
      <div className="grid gap-2 sm:grid-cols-2">{items.map(([k, l]) => <button key={k} type="button" disabled={!!busy} onClick={() => get(k)} className={`${btn} border border-slate-200 text-left text-slate-700`}>{busy === k ? "Preparing…" : `⬇ ${l}`}</button>)}</div>
      <Err text={error} />
    </div>
  );
}

function ApiKeys() {
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState("");
  const [made, setMade] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => apiClient.get("/shop/api-keys").then(({ data }) => setKeys(data.keys)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const create = async (e) => {
    e.preventDefault(); setError("");
    if (!name.trim()) return setError("Name the key, for example “Accounting”.");
    try { const { data } = await apiClient.post("/shop/api-keys", { name: name.trim() }); setMade(data.key); setName(""); load(); } catch (x) { setError(errMsg(x)); }
  };
  const revoke = async (k) => { if (window.confirm(`Revoke “${k.name}”? Anything using it stops working immediately.`)) { try { await apiClient.delete(`/shop/api-keys/${k._id}`); load(); } catch (x) { setError(errMsg(x)); } } };
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-black text-slate-800">API keys (read-only)</h3>
      <p className="text-[11px] text-slate-500">Lets your own software read products, stock and sales. A key can never change anything and never sees customer details. Keep keys secret: anyone with one can read your sales.</p>
      {made && <div className="rounded-xl bg-emerald-50 p-3 text-xs"><p className="font-bold text-emerald-900">Copy your key now. It won't be shown again.</p><p className="mt-1 break-all font-mono text-[11px]">{made}</p>
        <button type="button" onClick={() => navigator.clipboard?.writeText(made)} className="mt-2 font-bold text-emerald-700 underline">Copy</button> · <button type="button" onClick={() => setMade("")} className="font-bold text-slate-600 underline">I've saved it</button></div>}
      <ul className="divide-y divide-slate-100 text-xs">{keys.map((k) => <li key={k._id} className="flex items-center justify-between gap-2 py-2.5"><div className="min-w-0"><p className="font-black text-slate-900">{k.name}</p><p className="font-mono text-slate-500">{k.prefix}… · {k.lastUsedAt ? `used ${when(k.lastUsedAt)}` : "never used"}</p></div><button type="button" onClick={() => revoke(k)} className="font-bold text-red-600 underline">Revoke</button></li>)}</ul>
      <form onSubmit={create} className="flex gap-2"><input className={field} placeholder="New key name" aria-label="Key name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /><button type="submit" className={`${btn} shrink-0 bg-emerald-700 text-white`}>Create</button></form>
      <Err text={error} />
      <p className="rounded-xl bg-slate-50 p-3 font-mono text-[10px] leading-relaxed text-slate-600">GET {window.location.origin}/api/v1/sales?from=2026-11-01&amp;to=2026-11-30<br />Authorization: Bearer sk_live_…<br />Also: /api/v1/products, /api/v1/branches, /api/v1/branches/:id/stock (100 per page, ?page=2).</p>
    </div>
  );
}

function Branding({ shop, refresh }) {
  const { auth } = useAuth();
  const b = shop.branding || {};
  const [f, setF] = useState({ logo: b.logo || "", footer: b.footer || "", phone: b.phone || "", taxPin: b.taxPin || "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const pick = async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) return setMsg({ ok: false, t: "Use a JPG, PNG or WebP logo under 2 MB." });
    setBusy(true); setMsg(null);
    try { const url = await uploadImageToCloudinary(file, "profiles", () => auth.currentUser.getIdToken()); setF((s) => ({ ...s, logo: url })); } catch { setMsg({ ok: false, t: "Logo upload failed. Check your connection." }); } finally { setBusy(false); }
  };
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { await apiClient.put("/shop/branding", f); await refresh(); setMsg({ ok: true, t: "Saved. New receipts use this." }); }
    catch (x) { setMsg({ ok: false, t: x.response?.data?.error === "INVALID_TAX_PIN" ? "A KRA PIN looks like A123456789B." : errMsg(x) }); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-black text-slate-800">Receipt branding</h3>
      <div className="flex items-center gap-3">{f.logo ? <img src={f.logo} alt="Logo" className="h-14 w-14 rounded-lg border border-slate-200 object-contain" /> : <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-xl">🏪</span>}
        <label className={`${btn} inline-flex cursor-pointer items-center border border-slate-200 text-slate-700`}>{f.logo ? "Change logo" : "Add logo"}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pick} /></label>
        {f.logo && <button type="button" onClick={() => setF((s) => ({ ...s, logo: "" }))} className="text-xs font-bold text-red-600 underline">Remove</button>}</div>
      <input className={field} placeholder="Shop phone (printed on receipts)" aria-label="Phone" maxLength={20} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <input className={field} placeholder="KRA PIN (optional, printed only)" aria-label="KRA PIN" maxLength={11} value={f.taxPin} onChange={(e) => setF({ ...f, taxPin: e.target.value.toUpperCase() })} />
      <input className={field} placeholder="Footer message, e.g. Goods once sold are not returnable" aria-label="Footer" maxLength={120} value={f.footer} onChange={(e) => setF({ ...f, footer: e.target.value })} />
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-xl px-3 py-2 text-xs font-bold ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}
      <button type="submit" disabled={busy} className={`${btn} w-full bg-emerald-700 text-white`}>{busy ? "Saving…" : "Save branding"}</button>
    </form>
  );
}

function Support({ priority }) {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(null); // "new" | ticket
  const [t, setT] = useState(null);
  const [f, setF] = useState({ subject: "", category: "other", text: "" });
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => apiClient.get("/support/tickets").then(({ data }) => setList(data.tickets)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const view = async (id) => { try { setT((await apiClient.get(`/support/tickets/${id}`)).data.ticket); setOpen("thread"); } catch (x) { setError(errMsg(x)); } };
  const create = async (e) => {
    e.preventDefault(); setError("");
    try { await apiClient.post("/support/tickets", f); setF({ subject: "", category: "other", text: "" }); setOpen(null); load(); }
    catch (x) { setError(x.response?.data?.error === "TEXT_LENGTH_INVALID" ? "Add a subject (5+ characters) and describe the problem (10+)." : x.response?.data?.error === "TOO_MANY_OPEN" ? "You have 5 open tickets. Close one first." : errMsg(x)); }
  };
  const send = async (e) => { e.preventDefault(); if (!reply.trim()) return; try { await apiClient.post(`/support/tickets/${t._id}/messages`, { text: reply.trim() }); setReply(""); view(t._id); load(); } catch (x) { setError(errMsg(x)); } };
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-800">Support {priority && <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800">Priority</span>}</h3><button type="button" onClick={() => { setError(""); setOpen("new"); }} className={`${btn} bg-emerald-700 text-white`}>New ticket</button></div>
      {list.length === 0 ? <p className="py-3 text-center text-xs text-slate-500">No tickets.</p> : <ul className="divide-y divide-slate-100 text-xs">{list.map((x) => <li key={x._id}><button type="button" onClick={() => view(x._id)} className="flex w-full items-center justify-between gap-2 py-2.5 text-left"><span className="min-w-0 truncate font-bold text-slate-800">{x.subject}</span><span className="shrink-0 text-slate-500">{x.status} · {when(x.lastMessageAt)}</span></button></li>)}</ul>}
      {open === "new" && <Sheet title="New support ticket" onClose={() => setOpen(null)}><form onSubmit={create} className="space-y-3">
        <input className={field} placeholder="Subject" aria-label="Subject" maxLength={100} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
        <select className={field} aria-label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{["billing", "inventory", "pos", "network", "other"].map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <textarea className={`${field} resize-none py-2`} rows={5} maxLength={2000} placeholder="What happened? Include receipt or order numbers." aria-label="Details" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
        <Err text={error} /><button type="submit" className={`${btn} w-full bg-emerald-700 text-white`}>Send</button></form></Sheet>}
      {open === "thread" && t && <Sheet title={t.subject} onClose={() => setOpen(null)}><div className="space-y-2">
        {t.messages.map((m, i) => <div key={i} className={`rounded-xl p-3 text-xs ${m.by === "support" ? "bg-emerald-50" : "bg-slate-50"}`}><p className="mb-1 text-[10px] font-black uppercase text-slate-400">{m.by === "support" ? "Sokodigi support" : "You"} · {when(m.at)}</p><p className="whitespace-pre-line text-slate-800">{m.text}</p></div>)}
        {t.status !== "closed" && <form onSubmit={send} className="space-y-2 pt-2"><textarea className={`${field} resize-none py-2`} rows={3} maxLength={2000} placeholder="Reply" aria-label="Reply" value={reply} onChange={(e) => setReply(e.target.value)} /><button type="submit" className={`${btn} w-full bg-emerald-700 text-white`}>Send reply</button></form>}
        <Err text={error} /></div></Sheet>}
      {open === null && <Err text={error} />}
    </div>
  );
}

export default function ToolsTab() {
  const { shop, ent, refresh } = useShop();
  if (!shop || !ent) return null;
  const f = ent.features;
  return (
    <section className="space-y-4" aria-label="Business tools">
      <div><h2 className="text-lg font-black text-slate-900">Business tools</h2><p className="text-xs text-slate-500">Exports, API access, receipt branding and support.</p></div>
      {f.accountingExport ? <Exports /> : <Locked title="Accounting exports" text="Download sales, daily totals, credit ledger and stock valuation as CSV. Available on Omnichannel (KSh 1,000 a month)." />}
      {f.apiAccess ? <ApiKeys /> : <Locked title="API access" text="Read your products, stock and sales from your own software. Available on Omnichannel." />}
      {f.receiptBranding ? <Branding shop={shop} refresh={refresh} /> : <Locked title="Receipt branding" text="Put your logo, phone number and footer message on every receipt. Available on Omnichannel." />}
      <Support priority={!!f.prioritySupport} />
    </section>
  );
}
