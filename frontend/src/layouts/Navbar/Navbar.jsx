
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import brand from "../../constants/brand";
import styles from "./Navbar.module.css";

export default function Navbar({
  user,
  onLogout,
  onAuthClick,
  onSearchUpdate,
  socket,
}) {
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [unreadNotifications, setUnreadNotifications] = useState([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  const closeMenu = () => {
    setIsOpen(false);
    setShowNotifDropdown(false);
  };

  const toggleMenu = () => {
    setIsOpen((previous) => !previous);
  };

  const handleInputChange = (event) => {
    const value = event.target.value;
    setQuery(value);

    onSearchUpdate?.({
      q: value.toLowerCase(),
      type: "",
    });
  };

  const profileUserId =
    user?.uid ||
    user?.id ||
    user?._id ||
    user?.profile?.id ||
    user?.profile?._id ||
    user?.profile?.userId ||
    "";

  const resolvedAvatarUrl = useMemo(
    () =>
      user?.profilePhoto ||
      user?.profile?.profilePhoto ||
      user?.profilePic ||
      user?.photoURL ||
      user?.profile?.profilePic ||
      user?.profile?.photoURL ||
      "",
    [user]
  );

  useEffect(() => {
    setAvatarUrl(resolvedAvatarUrl);
  }, [resolvedAvatarUrl]);

  // Listen for live notifications.
  useEffect(() => {
    if (!user || !socket) return undefined;

    const handleIncomingNotification = (notification) => {
      setUnreadNotifications((previous) => [
        notification,
        ...previous,
      ]);

      try {
        const audio = new Audio("/sounds/notification-ping.mp3");
        audio.play().catch(() => {});
      } catch {
        // Audio may be unavailable in some browsers.
      }
    };

    socket.on("incoming-notification", handleIncomingNotification);

    return () => {
      socket.off(
        "incoming-notification",
        handleIncomingNotification
      );
    };
  }, [user, socket]);

  // Update the avatar immediately after a profile-photo change.
  useEffect(() => {
    const handleProfileAvatarUpdated = (event) => {
      const newAvatarUrl =
        event?.detail?.profilePhoto ||
        event?.detail?.profilePic ||
        event?.detail?.photoURL ||
        event?.detail?.url ||
        "";

      if (newAvatarUrl) {
        setAvatarUrl(newAvatarUrl);
      }
    };

    window.addEventListener(
      "profile-avatar-updated",
      handleProfileAvatarUpdated
    );

    return () => {
      window.removeEventListener(
        "profile-avatar-updated",
        handleProfileAvatarUpdated
      );
    };
  }, []);

  useEffect(() => {
    closeMenu();
    setShowSearchInput(false);
  }, [location.pathname]);

  const displayName =
    user?.name ||
    user?.displayName ||
    user?.profile?.name ||
    user?.profile?.displayName ||
    user?.email ||
    "User";

  const getNotificationText = (notification) =>
    notification?.message ||
    notification?.title ||
    notification?.text ||
    "You have a new notification.";

  return (
    <header className={styles["sokodigi-header"]}>
      <div className={styles["sokodigi-header__inner"]}>
        {/* Brand */}
        <Link
          to="/"
          className={styles["sokodigi-brand"]}
          onClick={closeMenu}
        >
          {brand.logo ? (
            <img
              src={brand.logo}
              alt={brand.name || "SokoDigi"}
              className={styles["sokodigi-brand__logo"]}
            />
          ) : (
            <span className={styles["brand-text"]}>
              {brand.name || "SokoDigi"}
            </span>
          )}
        </Link>

        {/* Main navigation */}
        <nav
          className={`${styles["sokodigi-nav"]} ${
            isOpen ? styles["menu-expanded"] : ""
          }`}
        >
          <Link to="/" onClick={closeMenu}>
            Home
          </Link>

          <Link to="/marketplace" onClick={closeMenu}>
            MarketHub
          </Link>

          {user && (
            <>
              <Link to="/messages" onClick={closeMenu}>
                💬 Messages
              </Link>

              <Link to="/dashboard" onClick={closeMenu}>
                Dashboard
              </Link>
            </>
          )}
        </nav>

        {/* Right-side actions */}
        <div className={styles["nav-actions-block"]}>
          {/* Search */}
          <div
            className={`${styles["nav-search-wrapper"]} ${
              showSearchInput ? styles["active-input"] : ""
            }`}
          >
            <button
              type="button"
              className={styles["nav-search-trigger"]}
              onClick={() =>
                setShowSearchInput((previous) => !previous)
              }
              aria-label={
                showSearchInput ? "Close search" : "Open search"
              }
              aria-expanded={showSearchInput}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line
                  x1="21"
                  y1="21"
                  x2="16.65"
                  y2="16.65"
                />
              </svg>
            </button>

            <input
              type="search"
              value={query}
              onChange={handleInputChange}
              placeholder="Quick scan..."
              className={styles["nav-search-field"]}
              aria-label="Search marketplace"
            />
          </div>

          {user ? (
            <div className={styles["profile-avatar-wrapper"]}>
              {/* Profile avatar */}
              <Link
                to={
                  profileUserId
                    ? `/profile/${encodeURIComponent(profileUserId)}`
                    : "/profile"
                }
                onClick={closeMenu}
                className={styles["avatar-profile-link"]}
                title="View my profile storefront"
                aria-label={`View ${displayName}'s profile`}
              >
                <div className={styles["avatar-circle"]}>
                  {avatarUrl ? (
                    <img
                      key={avatarUrl}
                      src={avatarUrl}
                      alt={`${displayName} profile`}
                      className={styles["avatar-img-element"]}
                      onError={() => setAvatarUrl("")}
                    />
                  ) : (
                    <svg
                      className={styles["avatar-fallback-icon"]}
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      width="1em"
                      height="1em"
                      aria-hidden="true"
                    >
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                  )}
                </div>
              </Link>

              {/* Notification bell and utility links */}
              <div className="relative flex items-center gap-1.5">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setShowNotifDropdown((previous) => !previous)
                    }
                    className="relative cursor-pointer rounded-lg bg-slate-100 p-1.5 text-slate-600 transition hover:bg-slate-200"
                    title="View system alerts"
                    aria-label="View notifications"
                    aria-expanded={showNotifDropdown}
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                      />
                    </svg>

                    {unreadNotifications.length > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">
                        {unreadNotifications.length}
                      </span>
                    )}
                  </button>

                  {/* Notifications dropdown */}
                  {showNotifDropdown && (
                    <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-3">
                        <span className="text-xs font-black text-slate-800">
                          Recent Alerts
                        </span>

                        {unreadNotifications.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setUnreadNotifications([])
                            }
                            className="text-[10px] font-bold text-emerald-600 hover:underline"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      <div className="max-h-60 divide-y divide-slate-50 overflow-y-auto">
                        {unreadNotifications.length === 0 ? (
                          <p className="p-4 text-center text-xs text-slate-400">
                            Everything is quiet right now.
                          </p>
                        ) : (
                          unreadNotifications.map(
                            (notification, index) => (
                              <div
                                key={
                                  notification?._id ||
                                  notification?.id ||
                                  `${notification?.createdAt || "notification"}-${index}`
                                }
                                className="p-3 transition hover:bg-slate-50"
                              >
                                <p className="text-xs font-semibold text-slate-700">
                                  {getNotificationText(notification)}
                                </p>

                                {notification?.createdAt && (
                                  <p className="mt-1 text-[10px] text-slate-400">
                                    {new Date(
                                      notification.createdAt
                                    ).toLocaleString()}
                                  </p>
                                )}
                              </div>
                            )
                          )
                        )}
                      </div>

                      <Link
                        to="/notifications"
                        onClick={closeMenu}
                        className="block border-t border-slate-100 p-3 text-center text-xs font-bold text-emerald-700 hover:bg-emerald-50"
                      >
                        See All Historical Logs →
                      </Link>
                    </div>
                  )}
                </div>

                <Link
                  to="/messages"
                  onClick={closeMenu}
                  className="rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-700"
                  title="Open inbox"
                >
                  💬 Inbox
                </Link>

                <Link
                  to="/wallet"
                  onClick={closeMenu}
                  className="rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-700"
                  title="Open wallet"
                >
                  💳 Wallet
                </Link>
              </div>

              {/* Logout */}
              <button
                type="button"
                className={styles["logout-btn"]}
                onClick={() => {
                  closeMenu();
                  onLogout?.();
                }}
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles["login-cta-button"]}
              onClick={() => {
                closeMenu();
                onAuthClick?.();
              }}
            >
              Get Started
            </button>
          )}

          {/* Mobile navigation toggle */}
          <button
            type="button"
            className={styles["mobile-toggle"]}
            onClick={toggleMenu}
            aria-label="Toggle navigation menu"
            aria-expanded={isOpen}
          >
            <span
              style={{
                transform: isOpen
                  ? "rotate(45deg) translate(5px, 6px)"
                  : "none",
              }}
            />
            <span
              style={{
                opacity: isOpen ? 0 : 1,
              }}
            />
            <span
              style={{
                transform: isOpen
                  ? "rotate(-45deg) translate(5px, -6px)"
                  : "none",
              }}
            />
          </button>
        </div>
      </div>
    </header>
  );
}
