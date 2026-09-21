import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import brand from "../../constants/brand";
import styles from "./Navbar.module.css";

export default function Navbar({
  user,
  onLogout,
  onAuthClick,
  onSearchUpdate,
}) {
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");

  const closeMenu = () => {
    setIsOpen(false);
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

  // Prioritise the true Mongoose database tracking key ("profilePhoto") at all layers
  const resolvedAvatarUrl = useMemo(() => {
    return (
      user?.profilePhoto || 
      user?.profile?.profilePhoto || 
      user?.profilePic ||
      user?.photoURL ||
      user?.profile?.profilePic ||
      user?.profile?.photoURL ||
      ""
    );
  }, [user]);

  // Synchronize instantly during page mounts or hard refreshes
  useEffect(() => {
    setAvatarUrl(resolvedAvatarUrl || "");
  }, [resolvedAvatarUrl]);

  // Intercept layout updates and map straight onto your new profilePhoto field
  useEffect(() => {
    const handleProfileAvatarUpdated = (event) => {
      console.log("Navbar intercepted custom update event:", event.detail);
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
    setIsOpen(false);
  }, [location.pathname]);

  const displayName =
    user?.name ||
    user?.displayName ||
    user?.profile?.name ||
    user?.profile?.displayName ||
    user?.email ||
    "User";

  return (
    <header className={styles["sokodigi-header"]}>
      <div className={styles["sokodigi-header__inner"]}>
        <Link to="/" className={styles["sokodigi-brand"]} onClick={closeMenu}>
          {brand.logo ? (
            <img
              src={brand.logo}
              alt={brand.name}
              className={styles["sokodigi-brand__logo"]}
            />
          ) : (
            <span className={styles["brand-text"]}>{brand.name}</span>
          )}
        </Link>

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
            <Link to="/dashboard" onClick={closeMenu}>
              Dashboard
            </Link>
          )}
        </nav>

        <div className={styles["nav-actions-block"]}>
          <div
            className={`${styles["nav-search-wrapper"]} ${
              showSearchInput ? styles["active-input"] : ""
            }`}
          >
            <button
              type="button"
              className={styles["nav-search-trigger"]}
              onClick={() => setShowSearchInput((previous) => !previous)}
              aria-label="Toggle search container"
            >
              <svg
                xmlns="http://w3.org"
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
                {/* 🎯 SYNTAX TYPO RESOLVED BELOW (x2 and y2 coordinates mapped accurately) */}
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>

            <input
              type="text"
              value={query}
              onChange={handleInputChange}
              placeholder="Quick scan..."
              className={styles["nav-search-field"]}
            />
          </div>

          {user ? (
            <div className={styles["profile-avatar-wrapper"]}>
              <Link
                to={profileUserId ? `/profile/${profileUserId}` : "/profile"}
                onClick={closeMenu}
                className={styles["avatar-profile-link"]}
                title="View My Profile Storefront"
                style={{
                  display: "block",
                  textDecoration: "none",
                }}
              >
                <div
                  className={styles["avatar-circle"]}
                  style={{ cursor: "pointer" }}
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={`${displayName} profile`}
                      className={styles["avatar-img-element"]}
                      crossOrigin="anonymous" 
                      onError={(event) => {
                        console.error("Navbar failed to render avatar source:", avatarUrl);
                        event.currentTarget.style.display = "none";
                        setAvatarUrl(""); 
                      }}
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

              <button
                type="button"
                className={styles["logout-btn"]}
                onClick={() => {
                  onLogout?.();
                  closeMenu();
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
                onAuthClick?.();
                closeMenu();
              }}
            >
              Get Started
            </button>
          )}

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
            <span style={{ opacity: isOpen ? 0 : 1 }} />
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
