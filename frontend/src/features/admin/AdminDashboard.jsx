import { useCallback, useEffect, useState } from "react";
import apiClient from "../../services/apiClient";

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

  const loadAttention = useCallback(async () => {
    try {
      const [o, w, t] = await Promise.all([apiClient.get("/admin/overview"), apiClient.get("/admin/withdrawals"), apiClient.get("/admin/topups")]);
      setOverview(o.data); setWithdrawals(w.data.items); setTopups(t.data.items); setLoadErr("");
    } catch (e) { setLoadErr(errCode(e)); }
  }, []);
  const loadAudit = useCallback(async () => {
    try { setAudit((await apiClient.get("/admin/audit")).data.items); } catch (e) { setLoadErr(errCode(e)); }
  }, []);
  const openMember = useCallback(async (id) => {
    try { setMember((await apiClient.get(`/admin/users/${id}`)).data); } catch (e) { setLoadErr(errCode(e)); }
  }, []);

  useEffect(() => { loadAttention(); }, [loadAttention]);
  useEffect(() => { if (tab === "audit") loadAudit(); }, [tab, loadAudit]);

  const search = async (e) => {
    e.preventDefault();
    try { setFound((await apiClient.get("/admin/users", { params: { q } })).data.items); } catch (x) { setLoadErr(errCode(x)); }
  };

  const done = () => {
    setDialog(null);
    loadAttention();
    if (member) openMember(member.user._id);
  };

  const tabBtn = (id, label) => (
    <button key={id} type="button" onClick={() => setTab(id)}
      className={`border-b-2 px-4 py-3 text-xs font-black ${tab === id ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-400"}`}>{label}</button>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-xl font-black text-slate-900">Admin</h1>
      {loadErr && <p role="alert" className="mt-2 text-xs font-bold text-red-600">Error: {loadErr}</p>}

      {overview && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Withdrawals to check", overview.withdrawalsNeedingAttention], ["Top-ups to check", overview.topupsNeedingAttention],
            ["Frozen wallets", overview.frozenWallets], ["Suspended members", overview.suspendedMembers]].map(([l, v]) => (
            <div key={l} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-black uppercase text-slate-400">{l}</p>
              <p className={`mt-1 text-2xl font-black ${v > 0 ? "text-amber-600" : "text-slate-900"}`}>{v}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex border-b border-slate-200">{tabBtn("attention", "Needs attention")}{tabBtn("members", "Members")}{tabBtn("audit", "Audit log")}</div>

      {tab === "attention" && (
        <div className="mt-5 space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-black text-slate-800">Withdrawals</h2>
            <ul className="space-y-2">
              {withdrawals.length === 0 && <p className="text-xs text-slate-400">Nothing waiting.</p>}
              {withdrawals.map((w) => (
                <Row key={w._id}>
                  <div>
                    <p className="font-black text-slate-800">{money(w.amount)} · {w.who}</p>
                    <p className="text-slate-500">To {w.phone} · {w.status} · {when(w.createdAt)}</p>
                    {w.failReason && <p className="text-amber-700">{w.failReason}</p>}
                    <p className="font-mono text-[10px] text-slate-400">{w.originatorConversationId}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className={`${btn} bg-emerald-600 text-white`} onClick={() => setDialog({
                      title: `Mark ${money(w.amount)} as paid`, confirm: "Mark paid", optionalReceipt: true,
                      warn: "Only if the M-Pesa portal shows this money REACHED the phone.",
                      url: `/admin/withdrawals/${w._id}/resolve`, body: { action: "paid" } })}>Paid</button>
                    <button className={`${btn} bg-red-600 text-white`} onClick={() => setDialog({
                      title: `Refund ${money(w.amount)} to the wallet`, confirm: "Refund", danger: true,
                      warn: "Only if the M-Pesa portal shows the money was NOT sent. Refunding a payment that went out loses money.",
                      url: `/admin/withdrawals/${w._id}/resolve`, body: { action: "refund" } })}>Refund</button>
                  </div>
                </Row>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-black text-slate-800">Top-ups</h2>
            <ul className="space-y-2">
              {topups.length === 0 && <p className="text-xs text-slate-400">Nothing waiting.</p>}
              {topups.map((t) => (
                <Row key={t._id}>
                  <div>
                    <p className="font-black text-slate-800">{money(t.amount)} · {t.who}</p>
                    <p className="text-slate-500">From {t.phone} · {t.status} · {when(t.createdAt)}</p>
                    <p className="font-mono text-[10px] text-slate-400">{t.checkoutRequestId}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className={`${btn} bg-emerald-600 text-white`} onClick={() => setDialog({
                      title: "Credit this top-up", confirm: "Credit wallet", needReceipt: true, needAmount: true, amount: t.amount,
                      warn: "Enter the receipt and amount EXACTLY as shown in the M-Pesa portal.",
                      url: `/admin/topups/${t._id}/resolve`, body: { action: "credit" } })}>Credit</button>
                    <button className={`${btn} bg-slate-200 text-slate-700`} onClick={() => setDialog({
                      title: "Reject this top-up", confirm: "Reject", danger: true,
                      url: `/admin/topups/${t._id}/resolve`, body: { action: "reject" } })}>Reject</button>
                  </div>
                </Row>
              ))}
            </ul>
          </section>
        </div>
      )}

      {tab === "members" && (
        <div className="mt-5 space-y-4">
          <form onSubmit={search} className="flex gap-2">
            <input className={input} placeholder="Email, username, brand, phone or SDK-number" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="submit" className={`${btn} bg-slate-900 text-white`}>Search</button>
          </form>
          <ul className="space-y-2">
            {found.map((u) => (
              <Row key={u._id}>
                <div>
                  <p className="font-black text-slate-800">{u.profile.brandName || u.profile.displayName || u.email}</p>
                  <p className="text-slate-500">{u.email} · {u.profile.membershipNumber || "no ID"} · {u.membershipStatus}</p>
                </div>
                <button className={`${btn} bg-slate-100 text-slate-700`} onClick={() => openMember(u._id)}>Open</button>
              </Row>
            ))}
          </ul>

          {member && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-xs">
              <p className="text-sm font-black text-slate-900">{member.profile.brandName || member.profile.displayName || member.user.email}</p>
              <p className="text-slate-500">{member.user.email} · {member.user.role} · {member.user.accountCategory} · <b>{member.user.membershipStatus}</b></p>
              <p>Wallet {money(member.wallet.balance)} · Escrow {money(member.wallet.escrowBalance)} {member.wallet.isFrozen && <b className="text-red-600">· FROZEN</b>}</p>
              <p>Open orders: {member.openOrders.asSeller} as seller · {member.openOrders.asBuyer} as buyer</p>
              {member.user.suspendReason && <p className="text-amber-700">Suspended: {member.user.suspendReason}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                {member.user.membershipStatus !== "suspended" ? (
                  <button className={`${btn} bg-red-600 text-white`} onClick={() => setDialog({
                    title: "Suspend this member", confirm: "Suspend", danger: true,
                    warn: "They are signed out everywhere, can't sign in, and their shop is hidden. Open orders are NOT cancelled.",
                    url: `/admin/users/${member.user._id}/suspend`, body: {} })}>Suspend</button>
                ) : (
                  <button className={`${btn} bg-emerald-600 text-white`} onClick={() => setDialog({
                    title: "Restore this member", confirm: "Restore",
                    url: `/admin/users/${member.user._id}/unsuspend`, body: {} })}>Restore</button>
                )}
                <button className={`${btn} bg-slate-200 text-slate-700`} onClick={() => setDialog({
                  title: member.wallet.isFrozen ? "Unfreeze wallet" : "Freeze wallet", confirm: member.wallet.isFrozen ? "Unfreeze" : "Freeze",
                  url: `/admin/users/${member.user._id}/freeze`, body: { frozen: !member.wallet.isFrozen } })}>
                  {member.wallet.isFrozen ? "Unfreeze wallet" : "Freeze wallet"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "audit" && (
        <ul className="mt-5 space-y-2">
          {audit.map((a) => (
            <Row key={a._id}>
              <div>
                <p className="font-black text-slate-800">{a.action} <span className="font-normal text-slate-500">· {a.targetType} {a.targetId}</span></p>
                <p className="text-slate-500">{a.note}</p>
              </div>
              <p className="text-right text-slate-400">{a.adminEmail}<br />{when(a.createdAt)}</p>
            </Row>
          ))}
        </ul>
      )}

      {dialog && <ActionDialog cfg={dialog} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  );
}
