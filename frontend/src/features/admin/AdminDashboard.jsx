import React, { useCallback, useEffect, useState } from "react";
import apiClient from "../../services/apiClient";
import { Link, useNavigate } from "react-router-dom";
import ROUTES from "../../constants/routes"; // Verify this exact relative import path matches your directory



const money = (n) => `Ksh ${Number(n || 0).toLocaleString()}`;
const when = (d) => (d ? new Date(d).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const errCode = (e) => (e.response ? e.response.data?.error || "REQUEST_FAILED" : "NETWORK_ERROR");
const input = "w-full rounded-xl border border-slate-200 p-2 text-sm focus:outline-emerald-600";
const btn = "rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer disabled:opacity-50";

/* One dialog for every action: it always asks for a written reason */
function ActionDialog({ cfg, onClose, onDone }) {
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState("");
  const [amount, setAmount] = useState(cfg.amount ? String(cfg.amount) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (note.trim().length < 5) return setErr("Write a reason (at least 5 characters).");
    setBusy(true); setErr("");
    try {
      await apiClient.post(cfg.url, {
        ...cfg.body, note: note.trim(),
        receipt: receipt.trim() || undefined,
        amount: amount ? Number(amount) : undefined,
      });
      onDone();
    } catch (x) { setErr(errCode(x)); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-900/60 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-sm font-black text-slate-900">{cfg.title}</h3>
        {cfg.warn && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">{cfg.warn}</p>}
        {cfg.needReceipt && <input className={input} placeholder="M-Pesa receipt (10 characters)" maxLength={10} value={receipt} onChange={(e) => setReceipt(e.target.value.toUpperCase())} />}
        {cfg.optionalReceipt && <input className={input} placeholder="M-Pesa receipt (optional)" maxLength={10} value={receipt} onChange={(e) => setReceipt(e.target.value.toUpperCase())} />}
        {cfg.needAmount && <input className={input} type="number" min="1" placeholder="Amount actually received (KES)" value={amount} onChange={(e) => setAmount(e.target.value)} />}
        <textarea className={`${input} resize-none`} rows={3} maxLength={200} placeholder="Reason (recorded in the audit log)" value={note} onChange={(e) => setNote(e.target.value)} />
        {err && <p role="alert" className="text-xs font-bold text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={`${btn} bg-slate-100 text-slate-600`}>Cancel</button>
          <button type="submit" disabled={busy} className={`${btn} ${cfg.danger ? "bg-red-600" : "bg-emerald-600"} text-white`}>{busy ? "Working…" : cfg.confirm}</button>
        </div>
      </form>
    </div>
  );
}

function Row({ children }) {
  return <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-4 text-xs">{children}</li>;
}

export default function AdminDashboard() {
  const [tab, setTab] = useState("attention");
  const [overview, setOverview] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [topups, setTopups] = useState([]);
  const [audit, setAudit] = useState([]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState([]);
  const [member, setMember] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [reports, setReports] = useState([]); 
  const [disputes, setDisputes] = useState([]);
  


  const navigate = useNavigate();

 useEffect(() => {
  if (tab !== "reports") return;

  const loadReports = async () => {
    try {
      const { data } = await apiClient.get("/admin/reports");
      setReports(Array.isArray(data.items) ? data.items : []);
      setLoadErr("");
    } catch (e) {
      setLoadErr(errCode(e));
    }
  };

  loadReports();
}, [tab]);

  const loadDisputes = useCallback(async () => {
  try { setDisputes((await apiClient.get("/admin/disputes")).data.items); } catch (e) { setLoadErr(errCode(e)); }
}, []);
