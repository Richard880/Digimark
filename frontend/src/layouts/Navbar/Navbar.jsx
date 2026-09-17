import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import brand from "../../constants/brand";
import styles from "./Navbar.module.css";

export default function Navbar({ user, onLogout, onAuthClick, onSearchUpdate }) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showSearchInput, setShowSearchInput] = useState(false);

  const toggleMenu = () => setIsOpen((prev) => !prev);
  const closeMenu = () => setIsOpen(false);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (onSearchUpdate) {
      onSearchUpdate({ q: val.toLowerCase(), type: "" });
    }
  };

  // 🎯 Resolve the absolute user profile link target string based on your session model properties
// 🎯 THE FIX: Add explicit support for Firebase's unique tracking identifier (uid)
const profileUserId = user?.uid || user?.id || user?._id || "";


  return (
    <header className={styles["sokodigi-header"]}>
      <div className={styles["sokodigi-header__inner"]}>
        
        {/* Column 1: Brand Identifier System */}
        <Link to="/" className={styles["sokodigi-brand"]} onClick={closeMenu}>
          {brand.logo ? (
            <img src={brand.logo} alt={brand.name} className={styles["sokodigi-brand__logo"]} />
          ) : (
            <span className={styles["brand-text"]}>{brand.name}</span>
          )}
        </Link>

        {/* Column 2: Navigation Anchors Row */}
        <nav className={`${styles["sokodigi-nav"]} ${isOpen ? styles["menu-expanded"] : ""}`}>
          <Link to="/" onClick={closeMenu}>Home</Link>
          <Link to="/marketplace" onClick={closeMenu}>MarketHub</Link>
          {user && <Link to="/dashboard" onClick={closeMenu}>Dashboard</Link>}
        </nav>

        {/* Column 3: Custom Embedded Action & Search Block Tools */}
        <div className={styles["nav-actions-block"]}>
          
          {/* THE NAVBAR INNER SEARCH EMBED CAPSULE */}
          <div className={`${styles["nav-search-wrapper"]} ${showSearchInput ? styles["active-input"] : ""}`}>
            <button 
              type="button" 
              className={styles["nav-search-trigger"]}
              onClick={() => setShowSearchInput(prev => !prev)}
              aria-label="Toggle search container"
            >
              <svg xmlns="http://w3.org" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
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
              {/* 🎯 THE FIX: Wrap the avatar in a Link to push them seamlessly to their brand storefront page */}
              <Link 
                to={`/profile/${profileUserId}`} 
                onClick={closeMenu}
                className={styles["avatar-profile-link"]}
                title="View My Profile Storefront"
                style={{ display: "block", textDecoration: "none" }}
              >
                <div className={styles["avatar-circle"]} style={{ cursor: "pointer" }}>
                  {user.profilePic ? (
                    <img src={user.profilePic} alt={user.name || "User profile"} />
                  ) : (
                    <svg className={styles["avatar-fallback-icon"]} viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                  )}
                </div>
              </Link>
              <button 
                type="button" 
                className={styles["logout-btn"]}
                onClick={() => { onLogout(); closeMenu(); }}
              >
                Logout
              </button>
            </div>
          ) : (
            <button 
              type="button"
              className={styles["login-cta-button"]}
              onClick={() => { onAuthClick(); closeMenu(); }}
            >
              Get Started
            </button>
          )}

          {/* Mobile Hamburger Button */}
          <button className={styles["mobile-toggle"]} onClick={toggleMenu} aria-label="Toggle navigation menu">
            <span style={{ transform: isOpen ? "rotate(45deg) translate(5px, 6px)" : "none" }} />
            <span style={{ opacity: isOpen ? 0 : 1 }} />
            <span style={{ transform: isOpen ? "rotate(-45deg) translate(5px, -6px)" : "none" }} />
          </button>

        </div>

      </div>
    </header>
  );
}
