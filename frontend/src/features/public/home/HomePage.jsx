import { useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import styles from "./HomePage.module.css";

// IMPORT YOUR LOCAL BACKDROP GRAPHIC FROM ASSETS
import heroBg from "../../../assets/hero-bg.jpeg"; 
import Shopping from "../../../assets/shopping.jpeg";// Ensure this path points to your actual image file

export default function HomePage() {
  const navigate = useNavigate();
  const { onAuthClick, onSearchUpdate } = useOutletContext() || {};
    const [localCategory, setLocalCategory] = useState("");

  const handleCapsuleSearchSubmit = (e) => {
    e.preventDefault();
    if (onSearchUpdate) {
      onSearchUpdate({ 
        q: localCategory.trim().toLowerCase(), 
        type: "" 
      });
    }
    navigate("/marketplace");
  };

  return (
    <div className={styles["landing-shell"]}>
      
      {/* ==========================================================================
         HERO CANVAS: Compact layout container housing text & nested search bar
         ========================================================================== */}
      <section 
        className={styles["hero-canvas"]}
        style={{ backgroundImage: `url(${heroBg})` }}
      >
        <div className={styles["hero-content"]}>
          <span className={styles["hero-tag"]}>
            📍 Featured today
          </span>
          <h1 className={styles["hero-headline"]}>
            Discover Premium Goods in Your Network Hub
          </h1>
          <p className={styles["hero-subtext"]}>
            Access secure logistics pipelines and exclusive wholesale vendor inventories. Tailored automatically to reflect your team's direct network commissions.
          </p>
          <button 
            type="button" 
            onClick={onAuthClick} 
            className={styles["hero-btn"]}
          >
            Explore Options
          </button>
        </div>

        {/* 🎯 FLOATING DOCK BAR: Splitting into double input segments mimicking the photo */}
        <div className={styles["capsule-dock-bar"]}>
          <form onSubmit={handleCapsuleSearchSubmit} className={styles["capsule-inner-split"]}>
            <div className={styles["input-split-zone"]}>
              
              {/* Segment 1: Base Query String Input
              <div className={styles["capsule-input-mesh"]}>
                <input 
                  type="text" 
                  value={localQuery}
                  onChange={(e) => setLocalQuery(e.target.value)}
                  placeholder="Option line code..."
                />
              </div>
              
              {/* The Vertical Separator Column 
              <div className={styles["track-divider"]} /> */}
              
              {/* Segment 2: Context Location Input */}
              <div className={styles["capsule-input-mesh"]}>
                <input 
                  type="text" 
                  value={localCategory}
                  onChange={(e) => setLocalCategory(e.target.value)}
                  placeholder="Search Marketplace by category, brand or product..."
                />
              </div>

            </div>
            
            <button type="submit" className={styles["capsule-action-btn"]}>
              Search Hub
            </button>
          </form>
        </div>
      </section>

      {/* ==========================================================================
         LOWER SECTIONS (Scroll blocks match layout perfectly)
         ========================================================================== */}
      <section className={styles["intro-section"]}>
        <div className={styles["intro-graphic-frame"]}>
          <span className={styles["intro-badge-icon"]}>
            <svg xmlns="http://w3.org" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            </svg>
          </span>
          <img src={Shopping} alt="SokoDigi Marketplace" className={styles["intro-graphic-image"]} />
        </div>
        
        <div className={styles["intro-text-pane"]}>
          <h2 className={styles["intro-headline"]}>Welcome on SokoDigi?</h2>
          <p className={styles["intro-paragraph"]}>
            We combine high-performance e-commerce structures with beautiful, intuitive aesthetics. Discover verified brand stores, analyze digital inventory nodes, and monitor real-time automated commissions.
          </p>
          <button 
            type="button" 
            onClick={() => navigate("/marketplace")} 
            className="px-6 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs rounded-full shadow-sm transition-all"
          >
            Explore Marketplace
          </button>
        </div>
      </section>
    </div>
  );
}
