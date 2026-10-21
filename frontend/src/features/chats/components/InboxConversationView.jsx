import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import apiClient from "../../../services/apiClient";
import ROUTES from "../../../constants/routes";

const MAX = 2000;
const THREAD_POLL_MS = 5000;
const INBOX_POLL_MS = 20000;

const ERR = {
  CHAT_NOT_ALLOWED: "You can message active Sokodigi shops, or people you've traded with.",
  USER_NOT_FOUND: "That account isn't available.",
  RECIPIENT_UNAVAILABLE: "This person can't receive messages right now.",
  CANNOT_MESSAGE_SELF: "You can't message yourself.",
  MESSAGE_TOO_LONG: "That message is too long.",
  TOO_MANY_REQUESTS: "You're sending messages too fast. Wait a moment.",
  CONVERSATION_NOT_FOUND: "That conversation isn't available.",
};
const errMsg = (e) => (!e.response ? "Couldn't reach Sokodigi. Check your connection." : ERR[e.response.data?.error] || "Something went wrong. Please try again.");

const merge = (a, b) => {
  const m = new Map(a.map((x) => [x.id, x]));
  b.forEach((x) => m.set(x.id, x));
  return [...m.values()].sort((x, y) => new Date(x.at) - new Date(y.at));
};

function timeLabel(d) {
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return "";
  const today = new Date();
  return t.toDateString() === today.toDateString()
    ? t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : t.toLocaleDateString([], { day: "numeric", month: "short" });
}

function Avatar({ name, photo, size = "h-10 w-10" }) {
  return (
    <div className={`${size} shrink-0 overflow-hidden rounded-full bg-emerald-50 flex items-center justify-center text-sm font-black text-emerald-700`}>
      {photo ? <img src={photo} alt="" className="h-full w-full object-cover" loading="lazy" /> : (name || "S").charAt(0).toUpperCase()}
    </div>
  );
}

export default function InboxConversationView() {
  const [params, setParams] = useSearchParams();
  const [inbox, setInbox] = useState([]);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [thread, setThread] = useState({ messages: [], with: null, hasMore: false });
  const [threadLoading, setThreadLoading] = useState(false);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");

  const bottomRef = useRef(null);
  const lastAtRef = useRef(null);   // newest message we've seen, so polls fetch only what's new
  const nearBottom = useRef(true);

  const loadInbox = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/chats/inbox");
      setInbox(data.items || []);
    } catch (e) {
      console.error("Inbox load failed:", e);
    } finally {
      setInboxLoading(false);
    }
  }, []);

  const openThread = useCallback(async (id) => {
    setActiveId(id);
    setThread({ messages: [], with: null, hasMore: false });
    setThreadLoading(true);
    setNotice("");
    lastAtRef.current = null;
    try {
      const { data } = await apiClient.get(`/chats/${id}/messages`);
      setThread({ messages: data.messages, with: data.with, hasMore: data.hasMore });
      lastAtRef.current = data.messages.at(-1)?.at || null;
      nearBottom.current = true;
      setInbox((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    } catch (e) {
      setNotice(errMsg(e));
      setActiveId(null);
    } finally {
      setThreadLoading(false);
    }
  }, []);

  // Inbox: load once, then refresh while the tab is visible
  useEffect(() => {
    loadInbox();
    const t = setInterval(() => document.visibilityState === "visible" && loadInbox(), INBOX_POLL_MS);
    return () => clearInterval(t);
  }, [loadInbox]);

  // Arrived from a product page: /messages?targetUser=<id>
  useEffect(() => {
    const target = params.get("targetUser");
    if (!target) return;
    (async () => {
      try {
        const { data } = await apiClient.post("/chats/start", { targetUserId: target });
        await openThread(data.conversationId);
      } catch (e) {
        setNotice(errMsg(e));
      } finally {
        setParams({}, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open thread: poll only for newer messages
  useEffect(() => {
    if (!activeId) return undefined;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { data } = await apiClient.get(`/chats/${activeId}/messages`, { params: { after: lastAtRef.current || undefined } });
        if (data.messages.length) {
          setThread((prev) => ({ ...prev, messages: merge(prev.messages, data.messages) }));
          lastAtRef.current = data.messages.at(-1).at;
        }
      } catch { /* the next poll tries again */ }
    }, THREAD_POLL_MS);
    return () => clearInterval(t);
  }, [activeId]);

  useEffect(() => {
    if (nearBottom.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [thread.messages]);

  const loadEarlier = async () => {
    const first = thread.messages[0];
    if (!first) return;
    try {
      const { data } = await apiClient.get(`/chats/${activeId}/messages`, { params: { before: first.at } });
      nearBottom.current = false;
      setThread((prev) => ({ ...prev, hasMore: data.hasMore, messages: merge(prev.messages, data.messages) }));
    } catch (e) { setNotice(errMsg(e)); }
  };

  // Optimistic send: the message shows instantly and is marked if it fails
  const send = async (body, tmpIdArg) => {
    const clean = body.trim();
    if (!clean || !activeId) return;
    const tmpId = tmpIdArg || `tmp-${Date.now()}`;
    nearBottom.current = true;
    setThread((prev) => ({
      ...prev,
      messages: merge(prev.messages.filter((m) => m.id !== tmpId), [{ id: tmpId, mine: true, text: clean, at: new Date().toISOString(), status: "sending" }]),
    }));
    try {
      const { data } = await apiClient.post(`/chats/${activeId}/messages`, { text: clean });
      setThread((prev) => ({ ...prev, messages: merge(prev.messages.filter((m) => m.id !== tmpId), [data.message]) }));
      loadInbox();
    } catch (e) {
      setThread((prev) => ({
        ...prev,
        messages: prev.messages.map((m) => (m.id === tmpId ? { ...m, status: "failed", error: errMsg(e) } : m)),
      }));
    }
  };

  const submit = (e) => {
    e.preventDefault();
    const body = text;
    if (!body.trim()) return;
    setText("");
    send(body);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) submit(e); // Shift+Enter makes a new line
  };

  const onScroll = (e) => {
    const el = e.currentTarget;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const showList = !activeId; // on phones, one pane at a time

  return (
    <div className="mx-auto max-w-5xl px-2 py-4 sm:px-4">
      <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
        Pay only through Sokodigi. Escrow protects payments made in the app, not money sent outside it. Never share your delivery PIN before you have your item.
      </p>
      {notice && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{notice}</p>}

      <div className="grid h-[72vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-[320px_1fr]">
        {/* Conversation list */}
        <aside className={`${showList ? "flex" : "hidden"} min-h-0 flex-col border-r border-slate-100 md:flex`}>
          <h1 className="border-b border-slate-100 px-4 py-3 text-sm font-black text-slate-900">Messages</h1>
          <div className="flex-1 overflow-y-auto">
            {inboxLoading ? (
              <p className="p-6 text-center text-xs text-slate-400">Loading…</p>
            ) : inbox.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No conversations yet.
                <br />
                Open a product and tap “Inquire / Negotiate With Trader”.
                <br />
                <Link to={ROUTES.MARKETPLACE} className="mt-2 inline-block font-bold text-emerald-700 underline">Browse the marketplace</Link>
              </div>
            ) : (
              inbox.map((c) => (
                <button key={c.id} type="button" onClick={() => openThread(c.id)}
                  className={`flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${c.id === activeId ? "bg-emerald-50/60" : ""}`}>
                  <Avatar name={c.with.name} photo={c.with.photo} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-xs font-black text-slate-800">{c.with.name}</p>
                      <span className="shrink-0 text-[10px] text-slate-400">{timeLabel(c.lastMessage.at)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-slate-500">{c.lastMessage.mine ? "You: " : ""}{c.lastMessage.text}</p>
                      {c.unread > 0 && (
                        <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1 text-[9px] font-black text-white">{c.unread > 99 ? "99+" : c.unread}</span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Thread */}
        <section className={`${showList ? "hidden" : "flex"} min-h-0 flex-col md:flex`}>
          {!activeId ? (
            <div className="flex flex-1 items-center justify-center text-xs text-slate-400">Choose a conversation to start chatting.</div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                <button type="button" onClick={() => setActiveId(null)} aria-label="Back to conversations"
                  className="rounded-lg px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100 md:hidden">←</button>
                <Avatar name={thread.with?.name} photo={thread.with?.photo} size="h-9 w-9" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900">{thread.with?.name || "…"}</p>
                  {thread.with?.username && (
                    <Link to={`/profile/${encodeURIComponent(thread.with.username)}`} className="text-[11px] font-semibold text-emerald-700 underline">View shop</Link>
                  )}
                </div>
              </header>

              <div onScroll={onScroll} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50/60 px-4 py-4">
                {threadLoading && <p className="text-center text-xs text-slate-400">Loading…</p>}
                {thread.hasMore && (
                  <button type="button" onClick={loadEarlier} className="mx-auto block text-[11px] font-bold text-emerald-700 underline">Load earlier messages</button>
                )}
                {!threadLoading && thread.messages.length === 0 && (
                  <p className="pt-10 text-center text-xs text-slate-400">Say hello 👋 and ask about the product, delivery or price.</p>
                )}
                {thread.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.mine ? "bg-emerald-600 text-white" : "bg-white text-slate-800 border border-slate-100"} ${m.status === "sending" ? "opacity-60" : ""}`}>
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      <p className={`mt-1 text-[10px] ${m.mine ? "text-emerald-100" : "text-slate-400"}`}>
                        {m.status === "sending" ? "Sending…" : m.status === "failed" ? "" : timeLabel(m.at)}
                      </p>
                      {m.status === "failed" && (
                        <p className="mt-1 text-[11px] font-bold text-red-100">
                          {m.error}{" "}
                          <button type="button" className="underline" onClick={() => send(m.text, m.id)}>Retry</button>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={submit} className="border-t border-slate-100 p-3">
                <div className="flex items-end gap-2">
                  <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown}
                    rows={1} maxLength={MAX} placeholder="Type a message…" aria-label="Message"
                    className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
                  <button type="submit" disabled={!text.trim()}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40">Send</button>
                </div>
                {text.length > MAX - 200 && <p className="mt-1 text-right text-[10px] text-slate-400">{text.length}/{MAX}</p>}
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
