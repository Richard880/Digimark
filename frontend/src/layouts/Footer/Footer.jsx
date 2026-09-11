import { Link } from "react-router-dom";
import brand from "../../constants/brand";
import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles["sokodigi-footer"]}>
      <div className={styles["footer-inner"]}>
        
        {/* Row 1: High Level Brand Metrics and Directional Links */}
        <div className={styles["footer-top-grid"]}>
          
          <div className={styles["brand-showcase"]}>
            {brand.logo && (
              <img src={brand.logo} alt={`${brand.name} Full Emblem`} className={styles["footer-logo"]} />
            )}
            <p className={styles["footer-tagline"]}>{brand.tagline}</p>
            <p className={styles["brand-desc"]}>
              Accelerating community growth through digital asset logistics escrow tunnels and verified cross-tier network distribution portals.
            </p>
          </div>

          <div className={styles["links-column"]}>
            <h5 className={styles["column-title"]}>MarketHub</h5>
            <ul className={styles["links-list"]}>
              <li><Link to="/marketplace">All Catalogs</Link></li>
              <li><Link to="/marketplace">Featured Brands</Link></li>
              <li><Link to="/marketplace">Hot Deals</Link></li>
            </ul>
          </div>

          <div className={styles["links-column"]}>
            <h5 className={styles["column-title"]}>Network Nodes</h5>
            <ul className={styles["links-list"]}>
              <li><Link to="/dashboard">My Hierarchy</Link></li>
              <li><Link to="/">Terms &amp; Ledgers</Link></li>
              <li><Link to="/">Data Privacy</Link></li>
            </ul>
          </div>

        </div>

        {/* Row 2: Values Strip matching the vectors under your logo perfectly */}
        <div className={styles["values-strip"]}>
          
          <div className={styles["value-capsule"]}>
            <svg xmlns="http://w3.org" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <path d="M16 10a4 4 0 0 1-8 0"></path>
            </svg>
            <span>Shop</span>
          </div>

          <div className={styles["value-capsule"]}>
            <svg xmlns="http://w3.org" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <span>Connect</span>
          </div>

          <div className={styles["value-capsule"]}>
            <svg xmlns="http://w3.org" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
            <span>Grow</span>
          </div>

          <div className={styles["value-capsule"]}>
            <svg xmlns="http://w3.org" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            <span>Trust</span>
          </div>

        </div>

        {/* Row 3: Lower Compliance Framework Block */}
        <div className={styles["footer-bottom-row"]}>
          <p className={styles["copyright-text"]}>
            © {new Date().getFullYear()} {brand.name}. All rights reserved.
          </p>
          <div className={styles["legal-anchors"]}>
            <Link to="/">Privacy System</Link>
            <Link to="/">Platform Terms</Link>
          </div>
        </div>

      </div>
    </footer>
  );
}
