import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import brand from "../../constants/brand";
import ROUTES from "../../constants/routes";
import apiClient from "../../services/apiClient";
import styles from "./Navbar.module.css";

const POLL_MS = 30000;

export default function Navbar({ user, onLogout, onAuthClick, onSearchUpdate, socket }) {
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [recent, setRecent] = useState([]); // newest first
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const signedIn = !!user;
  const isMarketer = user?.destination === "dashboard"; // active, paid marketer
  const needsMembership = user?.destination === "membership";

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setShowNotifDropdown(false);
  }, []);

  const handleInputChange = (event) => {
    const value = event.target.value;
    setQuery(value);
    onSearchUpdate?.({ q: value.toLowerCase(), type: "" });
  };

  const resolvedAvatarUrl = useMemo(
    () => user?.profilePhoto || user?.profile?.profilePhoto || user?.photoURL || "",
    [user]
  );
  useEffect(() => setAvatarUrl(resolvedAvatarUrl), [resolvedAvatarUrl]);

  // Real unread count from the server (not just what arrived while the page was open)
  const refreshUnread = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/notifications/unread-count");
      setUnreadCount(Number(data.count) || 0);
    } catch {
      /* the badge just keeps its last value */
    }
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/notifications", { params: { limit: 8 } });
      setRecent(Array.isArray(data) ? data : []);
    } catch {
      /* keep what we had */
    }
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setUnreadCount(0);
      setRecent([]);
      return undefined;
    }
    refreshUnread();
    const timer = setInterval(refreshUnread, POLL_MS);
    const onFocus = () => document.visibilityState === "visible" && refreshUnread();
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [signedIn, refreshUnread]);

  // Live pushes, when a connected socket is passed in (needs a long-running backend host)
  useEffect(() => {
    if (!signedIn || !socket) return undefined;
    const onIncoming = (n) => {
      setUnreadCount((c) => c + 1);
      setRecent((prev) => [n, ...prev].slice(0, 8));
    };
    socket.on("incoming-notification", onIncoming);
    return () => socket.off("incoming-notification", onIncoming);
  }, [signedIn, socket]);

  // Open the bell: load the latest alerts
  const toggleDropdown = () => {
    setShowNotifDropdown((open) => {
      if (!open) loadRecent();
      return !open;
    });
  };

  const markAllRead = async () => {
    try {
      await apiClient.post("/notifications/mark-all-read");
      setUnreadCount(0);
      setRecent((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      /* try again later */
    }
  };

  // The profile page updates the avatar through this event
  useEffect(() => {
    const onAvatar = (e) => {
      const url = e?.detail?.profilePhoto || "";
      if (url) setAvatarUrl(url);
    };
    window.addEventListener("profile-avatar-updated", onAvatar);
    return () => window.removeEventListener("profile-avatar-updated", onAvatar);
  }, []);

  // Close menus after navigating, and on Escape or an outside click
  useEffect(() => {
    closeMenu();
    setShowSearchInput(false);
  }, [location.pathname, closeMenu]);

  useEffect(() => {
    if (!showNotifDropdown) return undefined;
    const onKey = (e) => e.key === "Escape" && setShowNotifDropdown(false);
    const onClick = (e) => dropdownRef.current && !dropdownRef.current.contains(e.target) && setShowNotifDropdown(false);
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [showNotifDropdown]);

  const displayName = user?.displayName || user?.brandName || user?.email || "User";
  const safeLink = (url) => (typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : ROUTES.NOTIFICATIONS);

  return (
    <header className={styles["sokodigi-header"]}>
      <div className={styles["sokodigi-header__inner"]}>
        <Link to={ROUTES.HOME} className={styles["sokodigi-brand"]} onClick={closeMenu}>
          {brand.logo ? (
            <img src={brand.logo} alt={brand.name || "SokoDigi"} className={styles["sokodigi-brand__logo"]} />
          ) : (
            <span className={styles["brand-text"]}>{brand.name || "SokoDigi"}</span>
          )}
        </Link>

        <nav className={`${styles["sokodigi-nav"]} ${isOpen ? styles["menu-expanded"] : ""}`}>
          <Link to={ROUTES.HOME} onClick={closeMenu}>Home</Link>
          <Link to={ROUTES.MARKETPLACE} onClick={closeMenu}>MarketHub</Link>
          {signedIn && <Link to={ROUTES.MESSAGES} onClick={closeMenu}>💬 Messages</Link>}
          {isMarketer && <Link to={ROUTES.MEMBER_DASHBOARD} onClick={closeMenu}>Dashboard</Link>}
          {needsMembership && <Link to={ROUTES.MEMBERSHIP} onClick={closeMenu}>Membership</Link>}
        </nav>

        <div className={styles["nav-actions-block"]}>
          <div className={`${styles["nav-search-wrapper"]} ${showSearchInput ? styles["active-input"] : ""}`}>
            <button type="button" className={styles["nav-search-trigger"]}
              onClick={() => setShowSearchInput((p) => !p)}
              aria-label={showSearchInput ? "Close search" : "Open search"} aria-expanded={showSearchInput}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            <input type="search" value={query} onChange={handleInputChange} placeholder="Search products…"
              className={styles["nav-search-field"]} aria-label="Search marketplace" />
          </div>

          {signedIn ? (
            <div className={styles["profile-avatar-wrapper"]}>
              <Link to={ROUTES.MY_PROFILE} onClick={closeMenu} className={styles["avatar-profile-link"]}
                title="My profile and orders" aria-label={`${displayName}'s profile`}>
                <div className={styles["avatar-circle"]}>
                  {avatarUrl ? (
                    <img key={avatarUrl} src={avatarUrl} alt="" className={styles["avatar-img-element"]} onError={() => setAvatarUrl("")} />
                  ) : (
                    <svg className={styles["avatar-fallback-icon"]} viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" aria-hidden="true">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                  )}
                </div>
              </Link>

              <div className="relative flex items-center gap-1.5">
                <div className="relative" ref={dropdownRef}>
                  <button type="button" onClick={toggleDropdown}
                    className="relative cursor-pointer rounded-lg bg-slate-100 p-1.5 text-slate-600 transition hover:bg-slate-200"
                    title="Notifications" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} aria-expanded={showNotifDropdown}>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                    </svg>
                    {unreadCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </button>

                  {showNotifDropdown && (
                    <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-3">
                        <span className="text-xs font-black text-slate-800">Recent alerts</span>
                        {unreadCount > 0 && (
                          <button type="button" onClick={markAllRead} className="text-[10px] font-bold text-emerald-600 hover:underline">
                            Mark all read
                          </button>
                        )}
                      </div>
                      <div className="max-h-64 divide-y divide-slate-50 overflow-y-auto">
                        {recent.length === 0 ? (
                          <p className="p-4 text-center text-xs text-slate-400">Everything is quiet right now.</p>
                        ) : (
                          recent.map((n, i) => (
                            <Link key={n._id || `${n.createdAt}-${i}`} to={safeLink(n.actionUrl)} onClick={closeMenu}
                              className={`block p-3 transition hover:bg-slate-50 ${n.isRead ? "" : "bg-emerald-50/40"}`}>
                              <p className="text-xs font-bold text-slate-800">{n.title}</p>
                              <p className="text-xs text-slate-500">{n.message}</p>
                              {n.createdAt && <p className="mt-1 text-[10px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>}
                            </Link>
                          ))
                        )}
                      </div>
                      <Link to={ROUTES.NOTIFICATIONS} onClick={closeMenu}
                        className="block border-t border-slate-100 p-3 text-center text-xs font-bold text-emerald-700 hover:bg-emerald-50">
                        See all notifications →
                      </Link>
                    </div>
                  )}
                </div>

                <Link to={ROUTES.MESSAGES} onClick={closeMenu}
                  className="rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-700" title="Inbox">
                  💬 Inbox
                </Link>
                <Link to={ROUTES.WALLET} onClick={closeMenu}
                  className="rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-700" title="Wallet">
                  💳 Wallet
                </Link>
              </div>

              <button type="button" className={styles["logout-btn"]} onClick={() => { closeMenu(); onLogout?.(); }}>
                Logout
              </button>
            </div>
          ) : (
            <button type="button" className={styles["login-cta-button"]} onClick={() => { closeMenu(); onAuthClick?.(); }}>
              Get Started
            </button>
          )}

          <button type="button" className={styles["mobile-toggle"]} onClick={() => setIsOpen((p) => !p)}
            aria-label="Toggle navigation menu" aria-expanded={isOpen}>
            <span style={{ transform: isOpen ? "rotate(45deg) translate(5px, 6px)" : "none" }} />
            <span style={{ opacity: isOpen ? 0 : 1 }} />
            <span style={{ transform: isOpen ? "rotate(-45deg) translate(5px, -6px)" : "none" }} />
          </button>
        </div>
      </div>
    </header>
  );
}
