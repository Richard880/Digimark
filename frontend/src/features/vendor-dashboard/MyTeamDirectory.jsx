import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useAuth from "../auth/hooks/useAuth";
import apiClient from "../../services/apiClient";
import ROUTES, { profilePath, registerPath } from "../../constants/routes";
import { sizedImage } from "../../utils/image";

const LEVELS = [1, 2, 3, 4];
const PERCENT = { 1: 25, 2: 15, 3: 9, 4: 6 };

export default function MyTeamDirectory() {
  const { auth } = useAuth();
  const username = auth.profile?.username;

  const [level, setLevel] = useState(1);
  const [byLevel, setByLevel] = useState({}); // { 1: { members, page, hasMore } }
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (lvl, page = 1) => {
    setLoading(true); setError("");
    try {
      const { data } = await apiClient.get("/network/team-directory", { params: { level: lvl, page, limit: 20 } });
      setByLevel((prev) => ({
        ...prev,
        [lvl]: { page, hasMore: !!data.hasMore, members: page === 1 ? data.members : [...(prev[lvl]?.members || []), ...data.members] },
      }));
    } catch (e) {
      console.error("Team load failed:", e);
      setError(e.response ? "We couldn't load this level. Please try again." : "Couldn't reach Sokodigi. Check your connection.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (!byLevel[level]) load(level); else setLoading(false); }, [level, byLevel, load]);
  useEffect(() => {
    apiClient.get("/network/matrix-metrics").then(({ data }) => setCounts(data.generations || {})).catch(() => {});
  }, []);

  const copyInvite = async () => {
    if (!username) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}${registerPath(username)}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  const cur = byLevel[level];
  const q = filter.trim().toLowerCase();
  const members = (cur?.members || []).filter((m) => !q || [m.displayName, m.brandName, m.username].some((v) => String(v || "").toLowerCase().includes(q)));

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">My team</h1>
          <p className="mt-1 text-sm text-slate-500">Members in your network, up to four levels down.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={copyInvite} disabled={!username} className="min-h-10 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{copied ? "Copied ✓" : "Copy invite link"}</button>
          <Link to={ROUTES.MEMBERSHIP} className="flex min-h-10 items-center rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50">Membership</Link>
        </div>
      </div>

      <div className="mb-3 flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1" role="group" aria-label="Network levels">
        {LEVELS.map((l) => (
          <button key={l} type="button" onClick={() => { setLevel(l); setFilter(""); }} aria-pressed={level === l}
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-black ${level === l ? "bg-white text-emerald-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            Level {l}{counts[`level_${l}`] != null && <span className="ml-1 text-slate-400">({counts[`level_${l}`]})</span>}
          </button>
        ))}
      </div>
      <p className="mb-4 text-[11px] text-slate-500">At this level you can earn up to <b>{PERCENT[level]}%</b> of each membership payment, while you're an active member who meets the monthly activity requirements.</p>

      <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search this level by name or username…" aria-label="Search team" className="mb-4 min-h-11 w-full rounded-xl border border-slate-200 px-4 text-sm focus:border-emerald-500 focus:outline-none sm:w-80" />

      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{error} <button type="button" onClick={() => load(level, 1)} className="underline">Retry</button></p>}

      {loading && !cur ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}</div>
      ) : members.length > 0 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((m) => {
              const name = m.brandName || m.displayName || (m.username ? `@${m.username}` : "Member");
              const active = m.membershipStatus === "active";
              const photo = sizedImage(m.profilePhoto, 120);
              const body = (
                <>
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-slate-100 bg-slate-50">
                    {photo ? <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-lg font-black text-emerald-700">{name.charAt(0).toUpperCase()}</span>}
                    <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${active ? "bg-emerald-500" : "bg-amber-400"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-800">{name}</p>
                    {m.username && <p className="truncate text-xs text-slate-400">@{m.username}</p>}
                    <p className="mt-1 text-[10px] text-slate-400">Joined {new Date(m.joinedAt).toLocaleDateString("en-KE")}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase ${active ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{m.membershipStatus}</span>
                </>
              );
              const cls = "flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md";
              return m.username
                ? <Link key={m.id} to={profilePath(m.username)} className={cls}>{body}</Link>
                : <div key={m.id} className={cls}>{body}</div>;
            })}
          </div>
          {cur?.hasMore && !q && <div className="mt-5 text-center"><button type="button" disabled={loading} onClick={() => load(level, cur.page + 1)} className="min-h-10 rounded-xl border border-emerald-800/20 bg-white px-8 text-xs font-bold text-emerald-900 disabled:opacity-50">{loading ? "Loading…" : "Show more"}</button></div>}
        </>
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-14 text-center shadow-sm">
          <p className="text-4xl" aria-hidden="true">👥</p>
          <h3 className="mt-3 text-sm font-black text-slate-800">{q ? "No one matches that search" : `Nobody on level ${level} yet`}</h3>
          <p className="mx-auto mt-1 max-w-xs text-xs text-slate-400">{level === 1 ? "Share your invite link to bring people in. New members are placed in your network automatically." : "Members join this level as your team grows."}</p>
        </div>
      )}
    </div>
  );
}
