import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import useAuth from "../hooks/useAuth"; // 🎯 NEW: Import your auth hook context directly
import MatrixTreeChart from "../dashboard/components/MatrixTreeChart"; // Adjust relative pathways as needed
import LegDistributionCards from "../dashboard/components/LegDistributionCards";
import styles from "./Profile.module.css";

const API_URL = "http://localhost:3000";

export default function OnDisplay() {
  const { userId } = useParams(); 
  const navigate = useNavigate();
  const { auth } = useAuth(); // Extract current logged-in context metrics if viewing own profile

  const [ownerProfile, setOwnerProfile] = useState(null);
  const [matrixMetrics, setMatrixMetrics] = useState(null); // 🎯 NEW: Hold live matrix metrics state
  const [products, setAllProducts] = useState([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fallback securely targets the logged-in session profile if parameter is absent
    const activeTargetId = userId || auth?.currentUser?.id || JSON.parse(localStorage.getItem("mlm_user"))?.id;

    if (!activeTargetId) {
      setIsLoading(false);
      return;
    }

    const loadPublicBrandProfile = async () => {
      try {
        setIsLoading(true);

        // A. Fetch Owner Metadata Details
        const profileRes = await fetch(`${API_URL}/api/products/market`);
        let resolvedCategory = "retail";

        if (profileRes.ok) {
          const feedList = await profileRes.json();
          const matchedItem = feedList.find(p => p.shopId === activeTargetId);
          
          resolvedCategory = matchedItem?.accountCategory || "retail";

          setOwnerProfile(matchedItem ? {
            name: matchedItem.brandName || "SokoDigi Merchant",
            accountCategory: resolvedCategory,
            membershipNumber: matchedItem.membershipNumber || "N/A"
          } : {
            name: "Independent Brand Store",
            accountCategory: "retail",
            membershipNumber: "N/A"
          });
        }

        // B. 🎯 NEW: Fetch live tree metrics if the target belongs to the network affiliate track
        // Reuses the authenticated backend token path if viewing personal node indices
        if (resolvedCategory === "network" || activeTargetId === auth?.currentUser?.id) {
          const token = await auth?.currentUser?.getIdToken();
          const metricsRes = await fetch(`${API_URL}/api/network/matrix-metrics`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          
          if (metricsRes.ok) {
            const metricsData = await metricsRes.json();
            if (metricsData.ok) setMatrixMetrics(metricsData);
          }
        }

        // C. Fetch Products uploaded by this specific shop code index
        const response = await fetch(`${API_URL}/api/products?shopId=${activeTargetId}`);
        if (response.ok) {
          const data = await response.json();
          setAllProducts(data);
        }

      } catch (err) {
        console.error("🔒 Public profile verification track failure:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadPublicBrandProfile();
  }, [userId, auth]);

  const handleSubscribeAction = () => {
    if (isSubscribed) return;
    setIsSubscribed(true);
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
      <section className={styles["brand-shield-card"]} style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={styles["avatar-frame"]} style={{ backgroundColor: "#f0fdf4", borderRadius: "50%", padding: "12px" }}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="2.5rem" height="2.5rem" className="text-emerald-700">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
            <div className={styles["meta-titles"]}>
              <h1 className="text-xl font-black text-slate-900">{ownerProfile?.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-bold tracking-wider text-white bg-emerald-600 px-2 py-0.5 rounded uppercase">
                  {ownerProfile?.accountCategory || "Retail Store"}
                </span>
                {ownerProfile?.membershipNumber && (
                  <span className="text-xs font-mono text-slate-400">#{ownerProfile.membershipNumber}</span>
                )}
              </div>
            </div>
          </div>

          <button 
            type="button"
            onClick={handleSubscribeAction}
            className={`${styles["subscribe-brand-btn"]} px-4 py-2 rounded-lg font-bold text-sm transition-all`}
            style={{
              backgroundColor: isSubscribed ? "#f0fdf4" : "#065f46",
              color: isSubscribed ? "#047857" : "#ffffff",
              border: isSubscribed ? "1px solid #a7f3d0" : "none"
            }}
          >
            {isSubscribed ? "✓ Subscribed" : "Subscribe to Brand"}
          </button>
        </div>

        {/* 🎯 LIVE MATRIX SUMMARY OVERVIEW ROWS */}
        {matrixMetrics?.ok && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100 text-left">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Network downline</span>
              <span className="text-xl font-black text-slate-800">{matrixMetrics.summary?.totalDownline || 0}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Active Nodes</span>
              <span className="text-xl font-black text-emerald-600">{matrixMetrics.summary?.activeDownline || 0}</span>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Matrix Spillover Rate</span>
              <span className="text-xl font-black text-slate-800">{matrixMetrics.spilloverMetrics?.spilloverRatePercentage || 0}%</span>
            </div>
          </div>
        )}
      </section>

      {/* ==========================================================================
         🎯 NEW: MATRIX TREE CHARTS & LEG PERFORMANCE INDEX DECK PANELS
         ========================================================================== */}
      {matrixMetrics?.ok && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 my-8 text-left">
          <div className="lg:col-span-1">
            <MatrixTreeChart generations={matrixMetrics.generations} />
          </div>
          <div className="lg:col-span-2">
            <LegDistributionCards 
              legBalanceMatrix={matrixMetrics.legBalanceMatrix} 
              spilloverMetrics={matrixMetrics.spilloverMetrics} 
            />
          </div>
        </section>
      )}

      {/* ==========================================================================
         PRODUCT CATALOG GRID DISPLAY
         ========================================================================== */}
      <div className="space-y-6 mt-8">
        <h3 className="text-lg font-black text-slate-800 text-left">Active Storefront Catalog</h3>
        
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
{p.category || "General"}{p.name || "Untitled Product"}Price ValueKsh {parseFloat(p.price || 0).toLocaleString()});})})});}
