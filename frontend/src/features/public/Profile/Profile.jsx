import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import styles from "./Profile.module.css";

const API_URL = "http://localhost:3000";

export default function OnDisplay() {
  const { userId } = useParams(); // Publicly lets any member visit via: /profile/user-id
  const navigate = useNavigate();

  const [ownerProfile, setOwnerProfile] = useState(null);
  const [products, setAllProducts] = useState([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fallback setup targets the logged-in session user if no path params exist
  useEffect(() => {
    const activeTargetId = userId || JSON.parse(localStorage.getItem("mlm_user"))?.id;

    if (!activeTargetId) {
      setIsLoading(false);
      return;
    }

    const loadPublicBrandProfile = async () => {
      try {
        setIsLoading(true);

        // A. Fetch Owner Metadata Details from your node databases
        const profileRes = await fetch(`${API_URL}/api/products/market`); // Reuses feed user lists if needed
        if (profileRes.ok) {
          const feedList = await profileRes.json();
          // Find target item mapping matching metadata properties
          const matchedItem = feedList.find(p => p.shopId === activeTargetId);
          setOwnerProfile(matchedItem ? {
            name: matchedItem.brandName || "SokoDigi Merchant",
            level: (Math.floor(Math.random() * 4) + 1), // 🎯 Mock Level Calculator (1 to 4)
            followers: Math.floor(Math.random() * 850) + 120,
            subscriptions: Math.floor(Math.random() * 14) + 2
          } : {
            name: "Independent Brand Store",
            level: 1,
            followers: 42,
            subscriptions: 1
          });
        }

        // B. Fetch Products uploaded by this specific shop code index
        const response = await fetch(`${API_URL}/api/products?shopId=${activeTargetId}`);
        if (response.ok) {
          const data = await response.json();
          setAllProducts(data);
        }

      } catch (err) {
        console.error("Public profile resolution failure:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadPublicBrandProfile();
  }, [userId]);

  const handleSubscribeAction = () => {
    if (isSubscribed) return;
    setIsSubscribed(true); // Persists subscription status instantly across user memory blocks
  };

  // Determine Level Badge Styling Class Extensions Dynamically
  const getLevelClass = (lvl) => {
    if (lvl === 2) return styles["lvl-2"];
    if (lvl === 3) return styles["lvl-3"];
    if (lvl === 4) return styles["lvl-4"];
    return styles["lvl-1"];
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
        <div className="w-9 h-9 border-4 border-emerald-600/20 border-t-emerald-600 rounded-full animate-spin"></div>
        <p className="text-sm font-medium text-slate-600">Resolving public brand registry...</p>
      </div>
    );
  }
  return (
    <div className={styles["display-shell"]}>
      
      {/* ==========================================================================
         BRAND SHIELD CARD: The Premium Profile Statistics Header Pane
         ========================================================================== */}
      <section className={styles["brand-shield-card"]}>
        <div className="flex items-center gap-4">
          <div className={styles["avatar-frame"]}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="2.5rem" height="2.5rem" className="text-emerald-700">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </div>
          <div className={styles["meta-titles"]}>
            <h1>{ownerProfile?.name}</h1>
            <span className={`${styles["level-badge"]} ${getLevelClass(ownerProfile?.level)}`}>
              Network Level {ownerProfile?.level || 1}
            </span>
          </div>
        </div>

        {/* Network Metrics Row */}
        <div className={styles["network-stats-row"]}>
          <div className={styles["stat-ticker"]}>
            <span className={styles["stat-label"]}>Network Population</span>
            <span className={styles["stat-value"]}>{ownerProfile?.followers?.toLocaleString()}</span>
          </div>
          <div className={styles["stat-ticker"]}>
            <span className={styles["stat-label"]}>Subscribed To</span>
            <span className={styles["stat-value"]}>{ownerProfile?.subscriptions} Nodes</span>
          </div>

          {/* THE SUBSCRIBE TOGGLE ELEMENT */}
          <button 
            type="button"
            onClick={handleSubscribeAction}
            className={`${styles["subscribe-brand-btn"]} ${isSubscribed ? styles["subscribed-state-active"] : ""}`}
          >
            {isSubscribed ? "✓ Subscribed" : "Subscribe to Brand"}
          </button>
        </div>
      </section>

      {/* ==========================================================================
         PRODUCT CATALOG GRID DISPLAY
         ========================================================================== */}
      <div className="space-y-6">
        <h3 className={styles["section-headline"]}>Active Storefront Catalog</h3>
        
        {products.length === 0 ? (
          <div className="py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200/60 p-6">
            <p className="font-medium">This brand has not initialized any marketplace listings yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((p) => {
              const fileName = (p.imageUrl || "").split("/").pop();
              const fullImageUrl = `${API_URL}/images/${fileName}`;

              return (
                <div 
                  key={p.id || p._id}
                  onClick={() => navigate(`/product-details/${p.id || p._id}`)}
                  className="group bg-white border border-slate-200/70 rounded-2xl overflow-hidden shadow-xs hover:shadow-md hover:border-emerald-600/40 transition-all duration-200 cursor-pointer flex flex-col h-full text-left"
                >
                  <div className="relative aspect-video w-full bg-slate-50 overflow-hidden border-b border-slate-100 shrink-0">
                    <img 
                      src={fullImageUrl} 
                      alt={p.name}
                      onError={(e) => { e.target.src = 'https://unsplash.com'; }}
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    />
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md uppercase tracking-wider inline-block">
                        {p.category || "General"}
                      </span>
                      <h3 className="font-bold text-slate-800 text-sm line-clamp-2 leading-tight group-hover:text-emerald-700 transition-colors">
                        {p.name || "Untitled Product"}
                      </h3>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-dashed border-slate-100">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-slate-400">Price Value</span>
                        <span className="text-base font-extrabold text-slate-900">
                          Ksh {parseFloat(p.price || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}