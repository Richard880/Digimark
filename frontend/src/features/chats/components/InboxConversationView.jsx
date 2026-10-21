import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import apiClient from "../../../services/apiClient";
import useAuth from "../../auth/hooks/useAuth";
import ROUTES from "../../../constants/routes";
import useChatIdentity from "../services/useChatIdentity";
import { deriveKey, encryptPayload, decryptPayload, compressImage, encryptImage, uploadEncrypted, decryptImage, securityCode } from "../services/chatCrypto";

const MAX = 1500;
const THREAD_POLL_MS = 4000;
const INBOX_POLL_MS = 20000;
const REASONS = [["spam", "Spam"], ["scam", "Scam or fraud"], ["harassment", "Harassment"], ["inappropriate", "Inappropriate content"], ["other", "Something else"]];

const ERR = {
  CHAT_NOT_ALLOWED: "You can message active Sokodigi shops, or people you've traded with.",
  USER_NOT_FOUND: "That account isn't available.",
  RECIPIENT_UNAVAILABLE: "This message can't be delivered right now.",
  PEER_NO_KEYS: "This person hasn't turned on secure chat yet. They've been notified.",
  MESSAGE_TOO_LONG: "That message is too long.",
  TOO_MANY_REQUESTS: "You're doing that too fast. Wait a moment.",
  CONVERSATION_NOT_FOUND: "That conversation isn't available.",
  ALREADY_REPORTED: "You already reported this person today. We're looking at it.",
  TOO_BIG: "That photo is too large.",
  BAD_TYPE: "Please choose a JPG, PNG or WebP photo.",
  UPLOAD_FAILED: "The photo couldn't be uploaded. Check your connection.",
};
const errMsg = (e) => {
  if (e.code && ERR[e.code]) return ERR[e.code];
  if (e.message && ERR[e.message]) return ERR[e.message];
  return !e.response ? "Couldn't reach Sokodigi. Check your connection." : ERR[e.response.data?.error] || "Something went wrong. Please try again.";
};

const merge = (a, b) => {
  const m = new Map(a.map((x) => [x.id, x]));
  b.forEach((x) => m.set(x.id, x));
  return [...m.values()].sort((x, y) => new Date(x.at) - new Date(y.at));
};
const timeLabel = (d) => {
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return "";
  return t.toDateString() === new Date().toDateString()
    ? t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : t.toLocaleDateString([], { day: "numeric", month: "short" });
};

function Avatar({ name, photo, size = "h-10 w-10" }) {
  return (
    <div className={`${size} shrink-0 overflow-hidden rounded-full bg-emerald-50 flex items-center justify-center text-sm font-black text-emerald-700`}>
      {photo ? <img src={photo} alt="" className="h-full w-full object-cover" loading="lazy" /> : (name || "S").charAt(0).toUpperCase()}
    </div>
  );
}

function EncryptedImage({ meta }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let made = null;
    decryptImage(meta).then((u) => { made = u; alive ? setUrl(u) : URL.revokeObjectURL(u); }).catch(() => alive && setFailed(true));
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [meta]);
  if (failed) return <p className="text-xs italic opacity-80">🔒 Photo unavailable</p>;
  if (!url) return <div className="h-32 w-40 animate-pulse rounded-xl bg-black/10" />;
  const w = Number(meta.w) || 4, h = Number(meta.h) || 3;
  return (
    <button type="button" onClick={() => window.open(url, "_blank", "noopener")} className="block overflow-hidden rounded-xl">
      <img src={url} alt="Photo" className="max-h-64 max-w-full rounded-xl object-cover" style={{ aspectRatio: `${w} / ${h}` }} />
    </button>
  );
}

function Ticks({ read }) {
  return <span className={read ? "text-sky-200" : "text-emerald-100"} aria-label={read ? "Read" : "Sent"}>{read ? "✓✓" : "✓"}</span>;
}

/* Passphrase screen: setup, restore, or reset */
function PassphraseGate({ mode, onSubmit, onForgot, onRetry }) {
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const creating = mode !== "restore";

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (creating) {
      if (pass.length < 8) return setErr("Use at least 8 characters.");
      if (pass !== again) return setErr("The two passphrases don't match.");
    }
    setBusy(true);
    try {
      await onSubmit(pass);
    } catch (x) {
      const code = x.code || x.response?.data?.error;
      if (code === "WRONG_PASSPHRASE") setErr("That passphrase is wrong.");
      else if (code === "RECENT_LOGIN_REQUIRED") setErr("For your security, sign out, sign in again, then reset.");
      else if (code === "KEYS_EXIST") onRetry();
      else setErr(errMsg(x));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "setup" ? "Turn on secure chat" : mode === "reset" ? "Reset secure chat" : "Unlock your messages";
  const input = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none";
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-black text-slate-900">🔒 {title}</h1>
        {mode === "setup" && <p className="text-xs leading-relaxed text-slate-600">Your messages and photos are locked on your device, so only you and the person you're talking to can read them. Not even Sokodigi can. Choose a passphrase to protect your key. You'll need it on a new phone or browser.</p>}
        {mode === "restore" && <p className="text-xs leading-relaxed text-slate-600">Enter your chat passphrase to unlock your messages on this device.</p>}
        {mode === "reset" && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Resetting creates a new key. You won't be able to read your old messages, and the people you chat with will see that your security code changed.</p>}
        <input type="password" autoComplete="off" className={input} placeholder="Chat passphrase" value={pass} onChange={(e) => setPass(e.target.value)} />
        {creating && <input type="password" autoComplete="off" className={input} placeholder="Repeat passphrase" value={again} onChange={(e) => setAgain(e.target.value)} />}
        {mode !== "restore" && <p className="text-[11px] text-slate-500">We can't recover this passphrase. Write it somewhere safe.</p>}
        {err && <p role="alert" className="text-xs font-bold text-red-600">{err}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
          {busy ? "Working…" : mode === "restore" ? "Unlock" : mode === "reset" ? "Reset secure chat" : "Turn on"}
        </button>
        {mode === "restore" && <button type="button" onClick={onForgot} className="w-full text-[11px] font-bold text-slate-500 underline">I forgot my passphrase</button>}
      </form>
    </div>
  );
}

function ReportDialog({ messages, onClose, onSend }) {
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await onSend({ reason, details, share }); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-900/60 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-sm font-black text-slate-900">Report this person</h3>
        <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-xl border border-slate-200 p-2 text-sm">
          {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={500} placeholder="What happened? (optional)" className="w-full resize-none rounded-xl border border-slate-200 p-2 text-sm" />
        <label className="flex items-start gap-2 text-[11px] text-slate-600">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-0.5" />
          <span>Share the last {Math.min(10, messages.length)} text messages with Sokodigi support. Chats are private, so support only sees what you choose to share. Photos aren't included.</span>
        </label>
        {err && <p role="alert" className="text-xs font-bold text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{busy ? "Sending…" : "Send report"}</button>
        </div>
      </form>
    </div>
  );
}

export default function InboxConversationView() {
  const { auth } = useAuth();
  const userId = auth.user?._id ? String(auth.user._id) : null;
  const gate = useChatIdentity(userId);
  const { identity } = gate;

  const [params, setParams] = useSearchParams();
  const [inbox, setInbox] = useState([]);
  const [previews, setPreviews] = useState({});
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [meta, setMeta] = useState({ with: null, peerTyping: false, peerReadAt: null, blockedByMe: false, peerReady: true, hasMore: false });
  const [code, setCode] = useState("");
  const [keyChanged, setKeyChanged] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState(null); // "report" | "code"

  const idRef = useRef(null);
  const viewCache = useRef(new Map());
  const keyCache = useRef(new Map());
  const peerRef = useRef({ keys: [], current: null });
  const lastAtRef = useRef(null);
  const nearBottom = useRef(true);
  const lastTyping = useRef(0);
  const retryFiles = useRef(new Map());
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => { idRef.current = identity; viewCache.current.clear(); keyCache.current.clear(); }, [identity]);

  const convKey = (cid, peerPub) => {
    const k = `${cid}:${peerPub}`;
    if (!keyCache.current.has(k)) keyCache.current.set(k, deriveKey(idRef.current.privateKey, peerPub, cid));
    return keyCache.current.get(k);
  };

  // Decrypt one message. Messages from before a key reset stay locked.
  const openMessage = async (cid, m, peerKeys) => {
    if (viewCache.current.has(m.id)) return viewCache.current.get(m.id);
    const id = idRef.current;
    const base = { id: m.id, mine: m.mine, at: m.at, kind: m.kind };
    let vm = { ...base, locked: true };
    try {
      const myV = m.mine ? m.sv : m.rv;
      const peerV = m.mine ? m.rv : m.sv;
      const peerPub = peerKeys.find((k) => k.version === peerV)?.publicKey;
      if (id && myV === id.version && peerPub) {
        const payload = await decryptPayload(await convKey(cid, peerPub), m, {
          cid, senderPub: m.mine ? id.publicKey : peerPub, recipPub: m.mine ? peerPub : id.publicKey,
        });
        vm = { ...base, text: String(payload.t || ""), img: payload.img || null };
      }
    } catch { /* stays locked */ }
    viewCache.current.set(m.id, vm);
    return vm;
  };

  const loadInbox = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/chats/inbox");
      setInbox(data.items || []);
      setEmailAlerts(data.emailAlerts !== false);
    } catch (e) { console.error("Inbox load failed:", e); } finally { setInboxLoading(false); }
  }, []);

  useEffect(() => {
    if (gate.status !== "ready") return undefined;
    loadInbox();
    const t = setInterval(() => document.visibilityState === "visible" && loadInbox(), INBOX_POLL_MS);
    return () => clearInterval(t);
  }, [gate.status, loadInbox]);

  // Inbox previews are decrypted here, never by the server
  useEffect(() => {
    if (gate.status !== "ready") return;
    inbox.forEach(async (c) => {
      const lm = c.lastMessage;
      const key = `${c.id}:${lm.at}`;
      if (previews[key] !== undefined) return;
      let t = "Message";
      if (lm.kind === "image") t = "📷 Photo";
      else if (lm.ciphertext) {
        const vm = await openMessage(c.id, { id: `last-${key}`, mine: lm.mine, kind: lm.kind, ciphertext: lm.ciphertext, iv: lm.iv, sv: lm.sv, rv: lm.rv, at: lm.at }, c.peerKey ? [c.peerKey] : []);
        t = vm.locked ? "🔒 Encrypted message" : vm.text;
      }
      setPreviews((p) => ({ ...p, [key]: t }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox, gate.status]);

  const applyMeta = async (cid, data) => {
    const keys = data.peer?.keys || [];
    const cur = keys.find((k) => k.version === data.peer?.current) || null;
    peerRef.current = { keys, current: cur };
    setMeta((m) => ({ ...m, with: data.with, peerTyping: data.peerTyping, peerReadAt: data.peerReadAt, blockedByMe: data.blockedByMe, peerReady: !!cur, hasMore: data.hasMore ?? m.hasMore }));
    if (cur && idRef.current) {
      setCode(await securityCode(idRef.current.publicKey, cur.publicKey));
      try {
        const pinKey = `sokodigi_pin_${userId}_${cid}`;
        const pinned = localStorage.getItem(pinKey);
        if (!pinned) localStorage.setItem(pinKey, cur.publicKey);
        else setKeyChanged(pinned !== cur.publicKey);
      } catch { /* storage blocked: skip the warning */ }
    }
  };

  const acceptKeyChange = () => {
    try { localStorage.setItem(`sokodigi_pin_${userId}_${activeId}`, peerRef.current.current.publicKey); } catch { /* ignore */ }
    setKeyChanged(false);
  };

  const openThread = useCallback(async (id) => {
    setActiveId(id); setMessages([]); setThreadLoading(true); setNotice(""); setKeyChanged(false); setMenu(false);
    lastAtRef.current = null;
    try {
      const { data } = await apiClient.get(`/chats/${id}/messages`);
      await applyMeta(id, data);
      const vms = await Promise.all(data.messages.map((m) => openMessage(id, m, data.peer.keys || [])));
      setMessages(vms);
      lastAtRef.current = data.messages.at(-1)?.at || null;
      nearBottom.current = true;
      setInbox((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    } catch (e) { setNotice(errMsg(e)); setActiveId(null); } finally { setThreadLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Arriving from a product page: /messages?targetUser=<id>
  useEffect(() => {
    const target = params.get("targetUser");
    if (!target || gate.status !== "ready") return;
    (async () => {
      try {
        const { data } = await apiClient.post("/chats/start", { targetUserId: target });
        if (!data.peerReady) setNotice(ERR.PEER_NO_KEYS);
        await openThread(data.conversationId);
      } catch (e) { setNotice(errMsg(e)); } finally { setParams({}, { replace: true }); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate.status]);

  // Open thread: fetch only newer messages, plus typing and read status
  useEffect(() => {
    if (!activeId || gate.status !== "ready") return undefined;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { data } = await apiClient.get(`/chats/${activeId}/messages`, { params: { after: lastAtRef.current || undefined } });
        await applyMeta(activeId, data);
        if (data.messages.length) {
          const vms = await Promise.all(data.messages.map((m) => openMessage(activeId, m, data.peer.keys || [])));
          setMessages((prev) => merge(prev, vms));
          lastAtRef.current = data.messages.at(-1).at;
        }
      } catch { /* the next poll tries again */ }
    }, THREAD_POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, gate.status]);

  useEffect(() => { if (nearBottom.current) bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages]);

  const loadEarlier = async () => {
    const first = messages[0];
    if (!first) return;
    try {
      const { data } = await apiClient.get(`/chats/${activeId}/messages`, { params: { before: first.at } });
      const vms = await Promise.all(data.messages.map((m) => openMessage(activeId, m, data.peer.keys || [])));
      nearBottom.current = false;
      setMeta((m) => ({ ...m, hasMore: data.hasMore }));
      setMessages((prev) => merge(prev, vms));
    } catch (e) { setNotice(errMsg(e)); }
  };

  // Encrypt on this device, then send. If the keys changed meanwhile, refresh them and try once more.
  const deliver = async (kind, payload, retried = false) => {
    const id = idRef.current;
    const peer = peerRef.current.current;
    if (!peer) throw Object.assign(new Error("PEER_NO_KEYS"), { code: "PEER_NO_KEYS" });
    const key = await convKey(activeId, peer.publicKey);
    const enc = await encryptPayload(key, payload, { cid: activeId, senderPub: id.publicKey, recipPub: peer.publicKey });
    try {
      const { data } = await apiClient.post(`/chats/${activeId}/messages`, { kind, ...enc, sv: id.version, rv: peer.version });
      return data.message;
    } catch (e) {
      if (!retried && e.response?.data?.error === "KEYS_CHANGED") {
        const { data } = await apiClient.get(`/chats/${activeId}/messages`, { params: { after: new Date().toISOString() } });
        await applyMeta(activeId, data);
        return deliver(kind, payload, true);
      }
      throw e;
    }
  };

  const addLocal = (vm) => { nearBottom.current = true; setMessages((prev) => merge(prev.filter((m) => m.id !== vm.id), [vm])); };
  const settle = (tmpId, sent, base) => {
    viewCache.current.set(sent.id, { ...base, id: sent.id, at: sent.at });
    setMessages((prev) => merge(prev.filter((m) => m.id !== tmpId), [{ ...base, id: sent.id, at: sent.at }]));
    loadInbox();
  };
  const fail = (tmpId, e) => setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, status: "failed", error: errMsg(e) } : m)));

  const sendText = async (body, tmpIdArg) => {
    const clean = body.trim();
    if (!clean || !activeId) return;
    const tmpId = tmpIdArg || `tmp-${Date.now()}`;
    const base = { mine: true, kind: "text", text: clean };
    addLocal({ ...base, id: tmpId, at: new Date().toISOString(), status: "sending" });
    try { settle(tmpId, await deliver("text", { t: clean }), base); } catch (e) { fail(tmpId, e); }
  };

  const sendPhoto = async (file, tmpIdArg) => {
    const tmpId = tmpIdArg || `tmp-${Date.now()}`;
    retryFiles.current.set(tmpId, file);
    addLocal({ id: tmpId, mine: true, kind: "image", at: new Date().toISOString(), status: "sending", uploading: true });
    try {
      const { blob, w, h } = await compressImage(file);
      const { bytes, key, iv } = await encryptImage(blob);
      const url = await uploadEncrypted(bytes);
      const img = { url, key, iv, w, h };
      const sent = await deliver("image", { img });
      retryFiles.current.delete(tmpId);
      settle(tmpId, sent, { mine: true, kind: "image", img });
    } catch (e) { fail(tmpId, e); }
  };

  const onPickPhoto = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) sendPhoto(f);
  };

  const submit = (e) => {
    e.preventDefault();
    const body = text;
    if (!body.trim()) return;
    setText("");
    sendText(body);
  };

  const onChangeText = (e) => {
    setText(e.target.value);
    if (e.target.value && Date.now() - lastTyping.current > 3000) {
      lastTyping.current = Date.now();
      apiClient.post(`/chats/${activeId}/typing`).catch(() => {});
    }
  };

  const toggleBlock = async () => {
    setMenu(false);
    try {
      if (meta.blockedByMe) await apiClient.delete(`/chats/${activeId}/block`);
      else {
        if (!window.confirm("Block this person? They won't be able to message you. Open orders still work.")) return;
        await apiClient.post(`/chats/${activeId}/block`);
      }
      setMeta((m) => ({ ...m, blockedByMe: !m.blockedByMe }));
    } catch (e) { setNotice(errMsg(e)); }
  };

  const sendReport = async ({ reason, details, share }) => {
    const excerpt = share
      ? messages.filter((m) => !m.locked && m.text && !String(m.id).startsWith("tmp-")).slice(-10).map((m) => ({ id: m.id, text: m.text }))
      : [];
    await apiClient.post("/chats/report", { conversationId: activeId, reason, details, messages: excerpt });
    setDialog(null);
    setNotice("Thanks. Your report was sent to Sokodigi support.");
  };

  const toggleEmailAlerts = async () => {
    const next = !emailAlerts;
    setEmailAlerts(next);
    try { await apiClient.patch("/chats/settings", { emailAlerts: next }); } catch { setEmailAlerts(!next); }
  };

  /* ───────── Rendering ───────── */
  if (!userId) return null;
  if (gate.status === "loading") return <div className="flex justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" /></div>;
  if (gate.status === "error") {
    return (
      <div className="py-20 text-center text-xs text-slate-500">
        Couldn't load secure chat. <button type="button" onClick={gate.retry} className="font-bold text-emerald-700 underline">Try again</button>
      </div>
    );
  }
  if (gate.status !== "ready") {
    const submitFn = gate.status === "setup" ? gate.setup : gate.status === "reset" ? gate.reset : gate.restore;
    return <PassphraseGate mode={gate.status} onSubmit={submitFn} onForgot={gate.startReset} onRetry={gate.retry} />;
  }

  const showList = !activeId;
  const peerRead = meta.peerReadAt ? new Date(meta.peerReadAt).getTime() : 0;

  return (
    <div className="mx-auto max-w-5xl px-2 py-4 sm:px-4">
      <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800">
        🔒 Messages and photos are end-to-end encrypted. Pay only through Sokodigi, and never share your delivery PIN before you have your item.
      </p>
      {notice && <p role="status" className="mb-3 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">{notice}</p>}

      <div className="grid h-[72vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-[320px_1fr]">
        <aside className={`${showList ? "flex" : "hidden"} min-h-0 flex-col border-r border-slate-100 md:flex`}>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h1 className="text-sm font-black text-slate-900">Messages</h1>
            <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
              <input type="checkbox" checked={emailAlerts} onChange={toggleEmailAlerts} /> Email alerts
            </label>
          </div>
          <div className="flex-1 overflow-y-auto">
            {inboxLoading ? <p className="p-6 text-center text-xs text-slate-400">Loading…</p>
              : inbox.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No conversations yet.<br />Open a product and tap “Inquire / Negotiate With Trader”.<br />
                  <Link to={ROUTES.MARKETPLACE} className="mt-2 inline-block font-bold text-emerald-700 underline">Browse the marketplace</Link>
                </div>
              ) : inbox.map((c) => (
                <button key={c.id} type="button" onClick={() => openThread(c.id)}
                  className={`flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${c.id === activeId ? "bg-emerald-50/60" : ""}`}>
                  <Avatar name={c.with.name} photo={c.with.photo} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-xs font-black text-slate-800">{c.with.name}</p>
                      <span className="shrink-0 text-[10px] text-slate-400">{timeLabel(c.lastMessage.at)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-slate-500">{c.lastMessage.mine ? "You: " : ""}{previews[`${c.id}:${c.lastMessage.at}`] ?? "…"}</p>
                      {c.unread > 0 && <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1 text-[9px] font-black text-white">{c.unread > 99 ? "99+" : c.unread}</span>}
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </aside>

        <section className={`${showList ? "hidden" : "flex"} min-h-0 flex-col md:flex`}>
          {!activeId ? (
            <div className="flex flex-1 items-center justify-center text-xs text-slate-400">Choose a conversation to start chatting.</div>
          ) : (
            <>
              <header className="relative flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                <button type="button" onClick={() => setActiveId(null)} aria-label="Back" className="rounded-lg px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100 md:hidden">←</button>
                <Avatar name={meta.with?.name} photo={meta.with?.photo} size="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-slate-900">{meta.with?.name || "…"}</p>
                  <p className="text-[11px] font-semibold text-emerald-700">
                    {meta.peerTyping ? "typing…" : meta.with?.username ? <Link to={`/profile/${encodeURIComponent(meta.with.username)}`} className="underline">View shop</Link> : "\u00a0"}
                  </p>
                </div>
                <button type="button" onClick={() => setMenu((o) => !o)} aria-label="More options" aria-expanded={menu} className="rounded-lg px-2 py-1 text-lg font-black text-slate-500 hover:bg-slate-100">⋮</button>
                {menu && (
                  <div className="absolute right-3 top-12 z-20 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white text-xs font-bold shadow-lg">
                    <button type="button" onClick={() => { setMenu(false); setDialog("code"); }} className="block w-full px-4 py-2.5 text-left hover:bg-slate-50">Verify security code</button>
                    <button type="button" onClick={toggleBlock} className="block w-full px-4 py-2.5 text-left hover:bg-slate-50">{meta.blockedByMe ? "Unblock" : "Block"}</button>
                    <button type="button" onClick={() => { setMenu(false); setDialog("report"); }} className="block w-full px-4 py-2.5 text-left text-red-600 hover:bg-red-50">Report</button>
                  </div>
                )}
              </header>

              {keyChanged && (
                <div className="flex items-center justify-between gap-3 bg-amber-50 px-4 py-2 text-[11px] font-semibold text-amber-800">
                  <span>This person's security code changed (new phone or reset). Verify it before sharing anything sensitive.</span>
                  <button type="button" onClick={acceptKeyChange} className="shrink-0 rounded-lg bg-amber-600 px-2 py-1 font-bold text-white">OK</button>
                </div>
              )}
              {!meta.peerReady && <p className="bg-slate-50 px-4 py-2 text-[11px] font-semibold text-slate-600">{ERR.PEER_NO_KEYS}</p>}

              <div onScroll={(e) => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
                className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50/60 px-4 py-4">
                {threadLoading && <p className="text-center text-xs text-slate-400">Loading…</p>}
                {meta.hasMore && <button type="button" onClick={loadEarlier} className="mx-auto block text-[11px] font-bold text-emerald-700 underline">Load earlier messages</button>}
                {!threadLoading && messages.length === 0 && <p className="pt-10 text-center text-xs text-slate-400">Say hello 👋 and ask about the product, delivery or price.</p>}
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.mine ? "bg-emerald-600 text-white" : "border border-slate-100 bg-white text-slate-800"} ${m.status === "sending" ? "opacity-60" : ""}`}>
                      {m.locked ? <p className="text-xs italic opacity-80">🔒 Can't be read on this device (sent before your secure chat was reset)</p>
                        : m.uploading ? <p className="text-xs">Encrypting and sending photo…</p>
                        : m.kind === "image" && m.img ? <EncryptedImage meta={m.img} />
                        : <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                      <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${m.mine ? "text-emerald-100" : "text-slate-400"}`}>
                        {m.status === "sending" ? "Sending…" : m.status === "failed" ? "" : <>{timeLabel(m.at)}{m.mine && <Ticks read={new Date(m.at).getTime() <= peerRead} />}</>}
                      </p>
                      {m.status === "failed" && (
                        <p className="mt-1 text-[11px] font-bold text-red-100">{m.error}{" "}
                          <button type="button" className="underline" onClick={() => (m.kind === "image" ? sendPhoto(retryFiles.current.get(m.id), m.id) : sendText(m.text, m.id))}>Retry</button>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {meta.blockedByMe ? (
                <div className="border-t border-slate-100 p-3 text-center text-xs text-slate-500">
                  You blocked this person. <button type="button" onClick={toggleBlock} className="font-bold text-emerald-700 underline">Unblock</button>
                </div>
              ) : (
                <form onSubmit={submit} className="border-t border-slate-100 p-3">
                  <div className="flex items-end gap-2">
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickPhoto} className="hidden" />
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={!meta.peerReady} aria-label="Send a photo"
                      className="rounded-xl bg-slate-100 px-3 py-2 text-base hover:bg-slate-200 disabled:opacity-40">📷</button>
                    <textarea value={text} onChange={onChangeText}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) submit(e); }}
                      rows={1} maxLength={MAX} disabled={!meta.peerReady} placeholder={meta.peerReady ? "Type a message…" : "Waiting for them to turn on secure chat…"} aria-label="Message"
                      className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none disabled:bg-slate-50" />
                    <button type="submit" disabled={!text.trim() || !meta.peerReady} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40">Send</button>
                  </div>
                  {text.length > MAX - 200 && <p className="mt-1 text-right text-[10px] text-slate-400">{text.length}/{MAX}</p>}
                </form>
              )}
            </>
          )}
        </section>
      </div>

      {dialog === "report" && <ReportDialog messages={messages.filter((m) => !m.locked && m.text)} onClose={() => setDialog(null)} onSend={sendReport} />}
      {dialog === "code" && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setDialog(null)}>
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-black text-slate-900">Security code</h3>
            <p className="text-xs text-slate-600">If this exact code appears on {meta.with?.name || "their"} phone too (compare in person or on a call), your chat is private and nobody swapped the keys.</p>
            <p className="font-mono text-lg font-black tracking-wider text-emerald-800">{code || "…"}</p>
            <button type="button" onClick={() => setDialog(null)} className="rounded-lg bg-slate-100 px-4 py-1.5 text-xs font-bold text-slate-600">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
