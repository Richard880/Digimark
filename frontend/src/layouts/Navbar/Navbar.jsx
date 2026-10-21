import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

import brand from "../../constants/brand";
import ROUTES from "../../constants/routes";
import apiClient from "../../services/apiClient";

const POLL_MS = 30000;

const ICONS = {
  home: "M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  shop: "M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z",
  chat: "M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z",
  wallet: "M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3",
  user: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
  bell: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0",
  search: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
  menu: "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5",
  close: "M6 18L18 6M6 6l12 12",
};

function Icon({ name, className = "h-5 w-5" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[name]} />
    </svg>
  );
}

function Badge({ n }) {
  if (!n) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

const safeLink = (url) => (typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : ROUTES.NOTIFICATIONS);
const topLink = ({ isActive }) =>
  `rounded-full px-3.5 py-2 text-sm font-semibold transition ${isActive ? "bg-emerald-700 text-white" : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"}`;
const tabLink = ({ isActive }) =>
  `relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-bold ${isActive ? "text-emerald-700" : "text-slate-500"}`;

export default function Navbar({ user, onLogout, onAuthClick, onSearchUpdate, socket }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [unread, setUnread] = useState(0);
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const [recent, setRecent] = useState([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const bellRef = useRef(null);
  const userRef = useRef(null);

  const signedIn = !!user;
  const isMarketer = user?.destination === "dashboard"; // active, paid marketer
  const needsMembership = user?.destination === "membership";
  const isBuyer = signedIn && user?.accountCategory === "retail";
  const isAdmin = ["admin", "super_admin"].includes(user?.role);

  const links = useMemo(
    () =>
      [
        { to: ROUTES.HOME, label: "Home", end: true },
        { to: ROUTES.MARKETPLACE, label: "MarketHub" },
        signedIn && { to: ROUTES.MESSAGES, label: "Messages", badge: unreadMsgs },
        isMarketer && { to: ROUTES.MEMBER_DASHBOARD, label: "Dashboard" },
        needsMembership && { to: ROUTES.MEMBERSHIP, label: "Membership" },
        isBuyer && { to: ROUTES.BECOME_MARKETER, label: "Sell & Earn" },
        !signedIn && { to: ROUTES.REGISTER, label: "Sell & Earn" },
        isAdmin && { to: ROUTES.ADMIN_DASHBOARD, label: "Admin" },
      ].filter(Boolean),
    [signedIn, isMarketer, needsMembership, isBuyer, isAdmin, unreadMsgs]
  );

  const closeAll = useCallback(() => {
    setMenuOpen(false);
    setSearchOpen(false);
    setBellOpen(false);
    setUserMenuOpen(false);
  }, []);
  useEffect(() => closeAll(), [location.pathname, closeAll]);

  const avatarSrc = user?.profilePhoto || user?.profile?.profilePhoto || user?.photoURL || "";
  useEffect(() => setAvatarUrl(avatarSrc), [avatarSrc]);
  useEffect(() => {
    const onAvatar = (e) => e?.detail?.profilePhoto && setAvatarUrl(e.detail.profilePhoto);
    window.addEventListener("profile-avatar-updated", onAvatar);
    return () => window.removeEventListener("profile-avatar-updated", onAvatar);
  }, []);

  // Real unread counts, refreshed every 30 s and when the tab regains focus
  const refreshCounts = useCallback(async () => {
    try {
      const [n, m] = await Promise.all([
        apiClient.get("/notifications/unread-count"),
        apiClient.get("/chats/unread-count").catch(() => ({ data: { count: 0 } })),
      ]);
      setUnread(Number(n.data.count) || 0);
      setUnreadMsgs(Number(m.data.count) || 0);
    } catch { /* keep the last values */ }
  }, []);
  useEffect(() => {
    if (!signedIn) { setUnread(0); setUnreadMsgs(0); setRecent([]); return undefined; }
    refreshCounts();
    const t = setInterval(refreshCounts, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && refreshCounts();
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [signedIn, refreshCounts]);

  // Live pushes, when a connected socket is passed in (needs a long-running backend host)
  useEffect(() => {
    if (!signedIn || !socket) return undefined;
    const onIncoming = (n) => { setUnread((c) => c + 1); setRecent((p) => [n, ...p].slice(0, 8)); };
    socket.on("incoming-notification", onIncoming);
    return () => socket.off("incoming-notification", onIncoming);
  }, [signedIn, socket]);

  const toggleBell = async () => {
    setUserMenuOpen(false);
    const next = !bellOpen;
    setBellOpen(next);
    if (next) {
      try { const { data } = await apiClient.get("/notifications", { params: { limit: 8 } }); setRecent(Array.isArray(data) ? data : []); } catch { /* keep */ }
    }
  };
  const markAllRead = async () => {
    try {
      await apiClient.post("/notifications/mark-all-read");
      setUnread(0);
      setRecent((p) => p.map((n) => ({ ...n, isRead: true })));
    } catch { /* try later */ }
  };

  // Escape and outside-click close the open menus
  useEffect(() => {
    if (!bellOpen && !userMenuOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && (setBellOpen(false), setUserMenuOpen(false));
    const onDown = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [bellOpen, userMenuOpen]);

  const onSearchChange = (e) => { setQuery(e.target.value); onSearchUpdate?.({ q: e.target.value.toLowerCase(), type: "" }); };
  const onSearchSubmit = (e) => { e.preventDefault(); navigate(ROUTES.MARKETPLACE); setSearchOpen(false); };

  const displayName = user?.displayName || user?.brandName || user?.email || "Account";
  const searchField = (
    <form onSubmit={onSearchSubmit} role="search" className="relative w-full">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" className="h-4 w-4" /></span>
      <input type="search" value={query} onChange={onSearchChange} placeholder="Search products…" aria-label="Search marketplace"
        className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm focus:border-emerald-500 focus:bg-white focus:outline-none" />
    </form>
  );

  const avatar = (
    <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-emerald-50 text-emerald-700">
      {avatarUrl ? <img key={avatarUrl} src={avatarUrl} alt="" className="h-full w-full object-cover" onError={() => setAvatarUrl("")} /> : <Icon name="user" className="h-4 w-4" />}
    </span>
  );

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/90 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-6">
          <Link to={ROUTES.HOME} className="flex shrink-0 items-center" aria-label="Sokodigi home">
            {brand.logo ? <img src={brand.logo} alt={brand.name || "SokoDigi"} className="h-9 w-auto sm:h-10" /> : <span className="text-lg font-black text-emerald-800">{brand.name || "SokoDigi"}</span>}
          </Link>

          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Main">
            {links.map((l) => (
              <NavLink key={l.label} to={l.to} end={l.end} className={topLink}>
                <span className="relative">{l.label}<Badge n={l.badge} /></span>
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto hidden w-56 lg:block xl:w-72">{searchField}</div>

          <div className="ml-auto flex items-center gap-1 lg:ml-0">
            <button type="button" onClick={() => setSearchOpen((o) => !o)} aria-label="Search" aria-expanded={searchOpen}
              className="rounded-full p-2 text-slate-600 hover:bg-slate-100 lg:hidden"><Icon name={searchOpen ? "close" : "search"} /></button>

            {signedIn ? (
              <>
                <div className="relative" ref={bellRef}>
                  <button type="button" onClick={toggleBell} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={bellOpen}
                    className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100"><Icon name="bell" /><Badge n={unread} /></button>
                  {bellOpen && (
                    <div className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl md:absolute md:inset-x-auto md:right-0 md:top-auto md:mt-2 md:w-80">
                      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                        <span className="text-xs font-black text-slate-800">Notifications</span>
                        {unread > 0 && <button type="button" onClick={markAllRead} className="text-[11px] font-bold text-emerald-700 hover:underline">Mark all read</button>}
                      </div>
                      <div className="max-h-[60vh] divide-y divide-slate-50 overflow-y-auto md:max-h-72">
                        {recent.length === 0 ? <p className="p-5 text-center text-xs text-slate-400">Everything is quiet right now.</p> : recent.map((n, i) => (
                          <Link key={n._id || `${n.createdAt}-${i}`} to={safeLink(n.actionUrl)} className={`block px-4 py-3 hover:bg-slate-50 ${n.isRead ? "" : "bg-emerald-50/40"}`}>
                            <p className="text-xs font-bold text-slate-800">{n.title}</p>
                            <p className="text-xs text-slate-500">{n.message}</p>
                            {n.createdAt && <p className="mt-1 text-[10px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>}
                          </Link>
                        ))}
                      </div>
                      <Link to={ROUTES.NOTIFICATIONS} className="block border-t border-slate-100 p-3 text-center text-xs font-bold text-emerald-700 hover:bg-emerald-50">See all notifications →</Link>
                    </div>
                  )}
                </div>

                <Link to={ROUTES.WALLET} aria-label="Wallet" className="hidden rounded-full p-2 text-slate-600 hover:bg-slate-100 lg:block"><Icon name="wallet" /></Link>

                <div className="relative hidden lg:block" ref={userRef}>
                  <button type="button" onClick={() => { setBellOpen(false); setUserMenuOpen((o) => !o); }} aria-label="Account menu" aria-expanded={userMenuOpen}
                    className="rounded-full p-0.5 ring-2 ring-transparent hover:ring-emerald-200">{avatar}</button>
                  {userMenuOpen && (
                    <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm shadow-xl">
                      <p className="truncate border-b border-slate-100 px-4 py-3 text-xs font-black text-slate-800">{displayName}</p>
                      <Link to={ROUTES.MY_PROFILE} className="block px-4 py-2.5 font-semibold text-slate-700 hover:bg-emerald-50">My profile &amp; orders</Link>
                      <Link to={ROUTES.WALLET} className="block px-4 py-2.5 font-semibold text-slate-700 hover:bg-emerald-50">Wallet</Link>
                      {(isMarketer || needsMembership) && <Link to={ROUTES.MEMBERSHIP} className="block px-4 py-2.5 font-semibold text-slate-700 hover:bg-emerald-50">Membership</Link>}
                      {isMarketer && <Link to={ROUTES.MY_TEAM} className="block px-4 py-2.5 font-semibold text-slate-700 hover:bg-emerald-50">My team</Link>}
                      <button type="button" onClick={() => { closeAll(); onLogout?.(); }} className="block w-full border-t border-slate-100 px-4 py-2.5 text-left font-semibold text-rose-600 hover:bg-rose-50">Log out</button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <button type="button" onClick={() => { closeAll(); onAuthClick?.(); }}
                className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 sm:text-sm">Get Started</button>
            )}

            <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu" aria-expanded={menuOpen}
              className="rounded-full p-2 text-slate-700 hover:bg-slate-100 lg:hidden"><Icon name={menuOpen ? "close" : "menu"} /></button>
          </div>
        </div>

        {searchOpen && <div className="border-t border-slate-100 px-3 py-2 lg:hidden">{searchField}</div>}

        {menuOpen && (
          <nav className="border-t border-slate-100 bg-white px-3 py-3 lg:hidden" aria-label="Mobile">
            <div className="grid gap-1">
              {links.map((l) => (
                <NavLink key={l.label} to={l.to} end={l.end}
                  className={({ isActive }) => `flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold ${isActive ? "bg-emerald-700 text-white" : "text-slate-700 hover:bg-emerald-50"}`}>
                  {l.label}
                  {l.badge > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">{l.badge > 99 ? "99+" : l.badge}</span>}
                </NavLink>
              ))}
              {signedIn && (
                <>
                  <NavLink to={ROUTES.WALLET} className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-emerald-50">Wallet</NavLink>
                  <button type="button" onClick={() => { closeAll(); onLogout?.(); }} className="rounded-xl px-4 py-3 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50">Log out</button>
                </>
              )}
            </div>
          </nav>
        )}
      </header>

      {/* Bottom tab bar: phones and tablets, signed-in users only */}
      {signedIn && (
        <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <NavLink to={ROUTES.HOME} end className={tabLink}><Icon name="home" /><span>Home</span></NavLink>
          <NavLink to={ROUTES.MARKETPLACE} className={tabLink}><Icon name="shop" /><span>Market</span></NavLink>
          <NavLink to={ROUTES.MESSAGES} className={tabLink}><span className="relative"><Icon name="chat" /><Badge n={unreadMsgs} /></span><span>Messages</span></NavLink>
          <NavLink to={ROUTES.WALLET} className={tabLink}><Icon name="wallet" /><span>Wallet</span></NavLink>
          <NavLink to={ROUTES.MY_PROFILE} className={tabLink}>{avatar}<span>Profile</span></NavLink>
        </nav>
      )}
    </>
  );
}
