      
      <h1 className="text-xl font-black text-slate-900">Admin</h1>
      {loadErr && <p role="alert" className="mt-2 text-xs font-bold text-red-600">Error: {loadErr}</p>}

{overview && (
  <div className="space-y-4">
    {/* 1. Metric Counts Row Grid Container */}
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        ["Withdrawals to check", overview.withdrawalsNeedingAttention], 
        ["Top-ups to check", overview.topupsNeedingAttention],
        ["Frozen wallets", overview.frozenWallets], 
        ["Suspended members", overview.suspendedMembers]
      ].map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
          <p className={`mt-1 text-2xl font-black tabular-nums ${value > 0 ? "text-amber-600" : "text-slate-900"}`}>
            {value}
          </p>
        </div>
      ))}
    </div>

    {/* 2. Full-Width Automated Accounting Reconciliation Alert Panel */}
    <div className="mt-2">
      {overview.reconciliation ? (
        (!overview.reconciliation.ok || overview.reconciliation.issues?.length > 0) && (
          <div 
            role="alert" 
            className={`rounded-2xl border p-4 text-xs font-semibold shadow-xs ${
              overview.reconciliation.ok 
                ? "border-amber-200 bg-amber-50/70 text-amber-900" 
                : "border-rose-200 bg-rose-50/70 text-rose-900"
            }`}
          >
            <p className="font-black text-sm tracking-tight">
              {overview.reconciliation.ok ? "⚠️ Daily Check: Accounting Warnings" : "🚨 Daily Money Check FAILED"} 
              <span className="font-semibold text-slate-400 text-[11px] block sm:inline sm:ml-2">
                · {when(overview.reconciliation.at)}
              </span>
            </p>
            
            {overview.reconciliation.issues?.length > 0 && (
              <ul className="mt-2 list-disc pl-4 space-y-1 text-slate-700 font-medium">
                {overview.reconciliation.issues.map((issue) => (
                  <li key={issue.code || issue.detail}>{issue.detail}</li>
                ))}
              </ul>
            )}
          </div>
        )
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center">
          <p className="text-xs font-semibold text-slate-400">
            The daily automated audit check hasn't executed yet.
          </p>
        </div>
      )}
    </div>
  </div>
)}

     
<div className="mt-6 flex flex-wrap border-b border-slate-200">
  {tabBtn("attention", "Needs attention")}
  {tabBtn("members", "Members")}
  {tabBtn("audit", "Audit log")}
  {tabBtn("disputes", `Disputes${overview?.disputesOpen ? ` (${overview.disputesOpen})` : ""}`)} 
  {tabBtn("reports", "Reports")}
</div>

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
  {w.status === "AWAITING_APPROVAL" ? (
    <>
      <button className={`${btn} bg-emerald-600 text-white`} onClick={() => setDialog({
        title: `Approve ${money(w.amount)} to ${w.who}`, confirm: "Approve and send",
        warn: "Check the account's recent activity first. This sends real money to the saved phone number.",
        url: `/admin/withdrawals/${w._id}/approve`, body: {} })}>Approve</button>
      <button className={`${btn} bg-red-600 text-white`} onClick={() => setDialog({
        title: "Reject this withdrawal", confirm: "Reject and refund", danger: true,
        warn: "The money goes back to the member's wallet.",
        url: `/admin/withdrawals/${w._id}/reject`, body: {} })}>Reject</button>
    </>
  ) : (
    <> <div className="flex gap-2">
                    <button className={`${btn} bg-emerald-600 text-white`} onClick={() => setDialog({
                      title: `Mark ${money(w.amount)} as paid`, confirm: "Mark paid", optionalReceipt: true,
                      warn: "Only if the M-Pesa portal shows this money REACHED the phone.",
                      url: `/admin/withdrawals/${w._id}/resolve`, body: { action: "paid" } })}>Paid</button>
                    <button className={`${btn} bg-red-600 text-white`} onClick={() => setDialog({
                      title: `Refund ${money(w.amount)} to the wallet`, confirm: "Refund", danger: true,
                      warn: "Only if the M-Pesa portal shows the money was NOT sent. Refunding a payment that went out loses money.",
                      url: `/admin/withdrawals/${w._id}/resolve`, body: { action: "refund" } })}>Refund</button>
                  </div> </>
  )}
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

      {tab === "reports" && (
  <ul className="mt-5 space-y-2">
    {reports.length === 0 && <p className="text-xs text-slate-400">No open reports.</p>}
    {reports.map((r) => (
      <Row key={r._id}>
        <div className="max-w-xl">
          <p className="font-black text-slate-800">{r.reportedName} <span className="font-normal text-slate-500">reported by {r.reporterName} · {r.reason}</span></p>
          {r.distinctReporters7d >= 3 && <p className="font-bold text-red-600">{r.distinctReporters7d} different people reported this account this week</p>}
          {r.details && <p className="text-slate-600">“{r.details}”</p>}
          <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">Messages shared by the reporter (unverified text)</p>
          {r.excerpt.map((m) => (
            <p key={m.messageId} className={`text-slate-600 ${m.fromReported ? "font-semibold" : ""}`}>{m.fromReported ? "Reported: " : "Reporter: "}{m.text}</p>
          ))}
        </div>
        <div className="flex gap-2">
          <button className={`${btn} bg-slate-100 text-slate-700`} onClick={() => { setTab("members"); openMember(r.reportedId); }}>Open member</button>
          <button className={`${btn} bg-emerald-600 text-white`} onClick={() => setDialog({ title: "Action taken", confirm: "Close report", url: `/admin/reports/${r._id}/resolve`, body: { outcome: "actioned" } })}>Actioned</button>
          <button className={`${btn} bg-slate-200 text-slate-700`} onClick={() => setDialog({ title: "Dismiss report", confirm: "Dismiss", url: `/admin/reports/${r._id}/resolve`, body: { outcome: "dismissed" } })}>Dismiss</button>
        </div>
      </Row>
    ))}
  </ul>
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
