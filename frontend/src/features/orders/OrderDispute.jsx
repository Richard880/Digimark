import { useCallback, useEffect, useRef, useState } from "react";
import apiClient from "../../services/apiClient";
import useAuth from "../auth/hooks/useAuth";
import { uploadImageToCloudinary } from "../../utils/cloudinaryUploader";
import { sizedImage } from "../../utils/image";

const when = (d) => (d ? new Date(d).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const field = "min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-emerald-500 focus:outline-none";
const REASONS = {
  buyer: [["not_received", "I haven't received my item"], ["not_as_described", "The item isn't as described"], ["damaged", "The item arrived damaged"], ["other", "Something else"]],
  seller: [["buyer_unresponsive", "The buyer has the item but won't confirm"], ["other", "Something else"]],
};
const ERR = {
  DISPUTE_NOT_ALLOWED: "A problem can't be reported on this order any more.",
  DISPUTE_ALREADY_EXISTS: "A problem was already reported on this order.",
  TOO_EARLY: "Sellers can report a problem a few days after dispatch.",
  TEXT_LENGTH_INVALID: "Please describe the problem in at least 10 characters.",
  INVALID_IMAGES: "One of the photos couldn't be verified. Try again.",
  MESSAGE_LIMIT_REACHED: "This conversation reached its message limit. Support will review it.",
  DISPUTE_CLOSED: "This dispute is already closed.",
  CANNOT_WITHDRAW: "This dispute can't be withdrawn any more.",
  TOO_MANY_REQUESTS: "You're going too fast. Wait a moment.",
  EMPTY_MESSAGE: "Write a message or add a photo.",
  UPLOAD_FAILED: "A photo couldn't be uploaded. Check your connection.",
};
const errMsg = (e) => ERR[e.message] || (!e.response ? (e.message && !/Network|timeout/i.test(e.message) && e.message.length < 90 ? e.message : "Couldn't reach Sokodigi. Check your connection.") : ERR[e.response.data?.error] || "Something went wrong. Please try again.");

function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between"><h3 className="text-base font-black text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">✕</button></div>
        {children}
      </div>
    </div>
  );
}

function PhotoPicker({ files, setFiles, disabled }) {
  const ref = useRef(null);
  const [urls, setUrls] = useState([]);
  useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [files]);
  return (
    <div>
      <input ref={ref} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => { const picked = [...e.target.files]; e.target.value = ""; setFiles((p) => [...p, ...picked].slice(0, 3)); }} />
      <div className="flex flex-wrap gap-2">
        {urls.map((u, i) => (
          <div key={u} className="relative h-16 w-16">
            <img src={u} alt="" className="h-full w-full rounded-lg object-cover" />
            <button type="button" aria-label="Remove photo" onClick={() => setFiles((p) => p.filter((_, n) => n !== i))} className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-slate-900 text-[10px] text-white">✕</button>
          </div>
        ))}
        {files.length < 3 && <button type="button" disabled={disabled} onClick={() => ref.current?.click()} className="h-16 w-16 rounded-lg border border-dashed border-slate-300 text-xl text-slate-400">+</button>}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Up to 3 photos. Only you, the other person and Sokodigi support can open them.</p>
    </div>
  );
}

function useUpload() {
  const { auth } = useAuth();
  return (files) => Promise.all(files.map((f) => uploadImageToCloudinary(f, "disputes", () => auth.currentUser.getIdToken())));
}

function CreateSheet({ order, role, onClose, onDone }) {
  const upload = useUpload();
  const list = REASONS[role];
  const [reason, setReason] = useState(list[0][0]);
  const [details, setDetails] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (details.trim().length < 10) return setError(ERR.TEXT_LENGTH_INVALID);
    setBusy(true); setError("");
    try {
      const images = files.length ? await upload(files) : [];
      await apiClient.post("/disputes", { orderNumber: order.orderNumber, reason, details: details.trim(), images });
      onDone();
    } catch (x) { setError(errMsg(x)); } finally { setBusy(false); }
  };

  return (
    <Sheet title="Report a problem" onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">The payment stays on hold while Sokodigi support reviews both sides, then refunds the buyer or releases the money to the seller. Only report a real problem.</p>
        <select className={field} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="What went wrong">{list.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <textarea className={`${field} resize-none py-2`} rows={4} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Describe what happened, with dates and who you spoke to" />
        <PhotoPicker files={files} setFiles={setFiles} disabled={busy} />
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 flex-1 rounded-xl bg-slate-100 text-xs font-bold text-slate-700">Cancel</button>
          <button type="submit" disabled={busy} className="min-h-11 flex-1 rounded-xl bg-red-600 text-xs font-bold text-white disabled:opacity-50">{busy ? "Sending…" : "Report problem"}</button>
        </div>
      </form>
    </Sheet>
  );
}

const ROLE = { buyer: "Buyer", seller: "Seller", admin: "Sokodigi support" };
const OUTCOME = { refunded: "Decision: the buyer was refunded.", released: "Decision: the payment was released to the seller.", withdrawn: "This dispute was withdrawn." };

function ThreadSheet({ order, onClose, onChanged }) {
  const upload = useUpload();
  const [d, setD] = useState(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { const { data } = await apiClient.get(`/disputes/order/${encodeURIComponent(order.orderNumber)}`); setD(data.dispute); }
    catch (e) { setError(errMsg(e)); }
  }, [order.orderNumber]);
  useEffect(() => { load(); }, [load]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() && !files.length) return setError(ERR.EMPTY_MESSAGE);
    setBusy(true); setError("");
    try {
      const images = files.length ? await upload(files) : [];
      await apiClient.post(`/disputes/${d.id}/messages`, { text: text.trim(), images });
      setText(""); setFiles([]); await load();
    } catch (x) { setError(errMsg(x)); } finally { setBusy(false); }
  };
  const withdraw = async () => {
    if (!window.confirm("Withdraw this dispute? The order will carry on as normal.")) return;
    setBusy(true); setError("");
    try { await apiClient.post(`/disputes/${d.id}/withdraw`); onChanged(); onClose(); }
    catch (x) { setError(errMsg(x)); } finally { setBusy(false); }
  };

  return (
    <Sheet title={`Dispute · #${order.orderNumber}`} onClose={busy ? () => {} : onClose}>
      {!d ? <p className="py-6 text-center text-xs text-slate-500">{error || "Loading…"}</p> : (
        <div className="space-y-3">
          <p className={`rounded-xl px-3 py-2 text-xs font-bold ${d.status === "open" ? "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-700"}`}>
            {d.status === "open" ? "Under review. The payment is on hold." : OUTCOME[d.status] || "Closed."}
            {d.resolution?.note && <span className="mt-1 block font-normal">{d.resolution.note}</span>}
          </p>
          <ul className="space-y-2">
            {d.messages.map((m, i) => (
              <li key={i} className={`rounded-xl p-3 text-xs ${m.by === "admin" ? "bg-emerald-50" : m.mine ? "bg-slate-50" : "border border-slate-200"}`}>
                <p className="mb-1 text-[10px] font-black uppercase text-slate-400">{m.mine ? "You" : ROLE[m.by]} · {when(m.at)}</p>
                {m.text && <p className="whitespace-pre-line text-slate-800">{m.text}</p>}
                {m.images?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.images.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={sizedImage(u, 160)} alt="Evidence" className="h-16 w-16 rounded-lg object-cover" /></a>)}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {d.status === "open" && (
            <form onSubmit={send} className="space-y-2 border-t border-slate-100 pt-3">
              <textarea className={`${field} resize-none py-2`} rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a reply" />
              <PhotoPicker files={files} setFiles={setFiles} disabled={busy} />
              <button type="submit" disabled={busy} className="min-h-11 w-full rounded-xl bg-emerald-700 text-xs font-bold text-white disabled:opacity-50">{busy ? "Sending…" : "Send reply"}</button>
              {d.openedByMe && <button type="button" onClick={withdraw} disabled={busy} className="w-full text-[11px] font-bold text-slate-500 underline">It's sorted out: withdraw this dispute</button>}
            </form>
          )}
          {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}
        </div>
      )}
    </Sheet>
  );
}

export default function OrderDispute({ order, role, onChanged }) {
  const [sheet, setSheet] = useState(null); // "create" | "thread"
  if (role !== "buyer" && role !== "seller") return null;
  const s = order.orderStatus;
  const dl = order.deadlines || {};
  const sellerCanReport = dl.sellerDisputeAt && Date.now() >= new Date(dl.sellerDisputeAt).getTime();
  const done = () => { setSheet(null); onChanged?.(); };

  let line = null;
  let action = null;
  if (s === "PROCESSING" && dl.confirmBy) {
    line = role === "seller" ? `Confirm by ${when(dl.confirmBy)} or this order is cancelled automatically and the buyer is refunded.`
      : `If the seller doesn't confirm by ${when(dl.confirmBy)}, your order is cancelled and you're refunded automatically.`;
  } else if (s === "DISPATCHED" && dl.autoReleaseAt) {
    line = role === "buyer" ? `Payment is released to the seller automatically on ${when(dl.autoReleaseAt)} unless you report a problem before then.`
      : `You're paid automatically on ${when(dl.autoReleaseAt)} unless the buyer reports a problem.`;
    if (role === "buyer") action = <button type="button" onClick={() => setSheet("create")} className="min-h-10 rounded-xl border border-red-200 px-4 text-xs font-bold text-red-700 hover:bg-red-50">Report a problem</button>;
    else if (sellerCanReport) action = <button type="button" onClick={() => setSheet("create")} className="min-h-10 rounded-xl border border-red-200 px-4 text-xs font-bold text-red-700 hover:bg-red-50">Buyer won't confirm?</button>;
    else line += ` You can report a problem from ${when(dl.sellerDisputeAt)}.`;
  } else if (s === "DISPUTED") {
    line = "A problem was reported. The payment is on hold while Sokodigi support reviews it.";
    action = <button type="button" onClick={() => setSheet("thread")} className="min-h-10 rounded-xl bg-amber-500 px-4 text-xs font-bold text-white hover:bg-amber-600">View dispute</button>;
  } else if (order.disputeId) {
    action = <button type="button" onClick={() => setSheet("thread")} className="text-[11px] font-bold text-slate-500 underline">View dispute</button>;
  }
  if (!line && !action) return null;

  return (
    <div className="mt-3 space-y-2">
      {line && <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">{line}</p>}
      {action}
      {sheet === "create" && <CreateSheet order={order} role={role} onClose={() => setSheet(null)} onDone={done} />}
      {sheet === "thread" && <ThreadSheet order={order} onClose={() => setSheet(null)} onChanged={() => onChanged?.()} />}
    </div>
  );
}
