
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import useAuth from "../../auth/hooks/useAuth";
import MatrixTreeChart from "../dashboard/components/MatrixTreeChart";
import LegDistributionCards from "../dashboard/components/LegDistributionCards";
import styles from "./Profile.module.css";

// 🎯 THE FIX: Fallback to localhost dynamically if the environment variable isn't injected yet
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";


export default function OnDisplay() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { auth } = useAuth();

  const [ownerProfile, setOwnerProfile] = useState(null);
  const [matrixMetrics, setMatrixMetrics] = useState(null);
  const [products, setAllProducts] = useState([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = (() => {
      try {
        return JSON.parse(localStorage.getItem("mlm_user"));
      } catch {
        return null;
      }
    })();

    const activeTargetId =
      userId ||
      auth?.currentUser?.id ||
      storedUser?.id;

    if (!activeTargetId) {
      setIsLoading(false);
      return;
    }

    const loadPublicBrandProfile = async () => {
      try {
        setIsLoading(true);

        // ================================================================
        // A. FETCH OWNER METADATA
        // ================================================================

        const profileRes = await fetch(
          `${API_URL}/api/products/market`
        );

        let resolvedCategory = "retail";

        if (profileRes.ok) {
          const feedList = await profileRes.json();

          const matchedItem = Array.isArray(feedList)
            ? feedList.find(
                (product) => product.shopId === activeTargetId
              )
            : null;

          resolvedCategory =
            matchedItem?.accountCategory || "retail";

          setOwnerProfile(
            matchedItem
              ? {
                  name:
                    matchedItem.brandName ||
                    "SokoDigi Merchant",
                  accountCategory: resolvedCategory,
                  membershipNumber:
                    matchedItem.membershipNumber || "N/A",
                }
              : {
                  name: "Independent Brand Store",
                  accountCategory: "retail",
                  membershipNumber: "N/A",
                }
          );
        } else {
          setOwnerProfile({
            name: "Independent Brand Store",
            accountCategory: "retail",
            membershipNumber: "N/A",
          });
        }

        // ================================================================
        // B. FETCH LIVE MATRIX METRICS
        // ================================================================

        if (
          resolvedCategory === "network" ||
          activeTargetId === auth?.currentUser?.id
        ) {
          let token = null;

          if (auth?.currentUser?.getIdToken) {
            token = await auth.currentUser.getIdToken();
          }

          const metricsRes = await fetch(
            `${API_URL}/api/network/matrix-metrics`,
            {
              headers: token
                ? {
                    Authorization: `Bearer ${token}`,
                  }
                : {},
            }
          );

          if (metricsRes.ok) {
            const metricsData = await metricsRes.json();

            if (metricsData?.ok) {
              setMatrixMetrics(metricsData);
            }
          }
        }

        // ================================================================
        // C. FETCH PRODUCTS FOR THIS SHOP
        // ================================================================

        const response = await fetch(
          `${API_URL}/api/products?shopId=${encodeURIComponent(
            activeTargetId
          )}`
        );

        if (response.ok) {
          const data = await response.json();

          setAllProducts(
            Array.isArray(data)
              ? data
              : data?.products || []
          );
        } else {
          setAllProducts([]);
        }
      } catch (err) {
        console.error(
          "Public profile verification track failure:",
          err
        );

        setAllProducts([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadPublicBrandProfile();
  }, [userId, auth]);

  // ================================================================
  // SUBSCRIBE ACTION
  // ================================================================

  const handleSubscribeAction = () => {
    if (isSubscribed) {
      return;
    }

    setIsSubscribed(true);
  };

  // ================================================================
  // LOADING STATE
  // ================================================================

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
        <div className="w-9 h-9 border-4 border-emerald-600/20 border-t-emerald-600 rounded-full animate-spin" />

        <p className="text-sm font-medium text-slate-600">
          Resolving public brand registry...
        </p>
      </div>
    );
  }

  // ================================================================
  // MAIN DISPLAY
  // ================================================================

  return (
    <div className={styles["display-shell"]}>
      {/* ================================================================
          BRAND SHIELD CARD
          ================================================================ */}

      <section
        className={styles["brand-shield-card"]}
        style={{
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div
              className={styles["avatar-frame"]}
              style={{
                backgroundColor: "#f0fdf4",
                borderRadius: "50%",
                padding: "12px",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="2.5rem"
                height="2.5rem"
                className="text-emerald-700"
                aria-hidden="true"
              >
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>

            {/* Brand Metadata */}
            <div className={styles["meta-titles"]}>
              <h1 className="text-xl font-black text-slate-900">
                {ownerProfile?.name || "SokoDigi Merchant"}
              </h1>

              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-bold tracking-wider text-white bg-emerald-600 px-2 py-0.5 rounded uppercase">
                  {ownerProfile?.accountCategory ||
                    "Retail Store"}
                </span>

                {ownerProfile?.membershipNumber && (
                  <span className="text-xs font-mono text-slate-400">
                    #{ownerProfile.membershipNumber}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Subscribe */}
          <button
            type="button"
            onClick={handleSubscribeAction}
            className={`${styles["subscribe-brand-btn"]} px-4 py-2 rounded-lg font-bold text-sm transition-all`}
            style={{
              backgroundColor: isSubscribed
                ? "#f0fdf4"
                : "#065f46",
              color: isSubscribed
                ? "#047857"
                : "#ffffff",
              border: isSubscribed
                ? "1px solid #a7f3d0"
                : "none",
            }}
          >
            {isSubscribed
              ? "✓ Subscribed"
              : "Subscribe to Brand"}
          </button>
        </div>

        {/* ================================================================
            LIVE MATRIX SUMMARY
            ================================================================ */}

        {matrixMetrics?.ok && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100 text-left">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Total Network Downline
              </span>

              <span className="text-xl font-black text-slate-800">
                {matrixMetrics.summary?.totalDownline || 0}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Active Nodes
              </span>

              <span className="text-xl font-black text-emerald-600">
                {matrixMetrics.summary?.activeDownline || 0}
              </span>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Matrix Spillover Rate
              </span>

              <span className="text-xl font-black text-slate-800">
                {matrixMetrics.spilloverMetrics
                  ?.spilloverRatePercentage || 0}
                %
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ================================================================
          MATRIX TREE + LEG PERFORMANCE PANELS
          ================================================================ */}

      {matrixMetrics?.ok && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 my-8 text-left">
          <div className="lg:col-span-1">
            <MatrixTreeChart
              generations={matrixMetrics.generations}
            />
          </div>

          <div className="lg:col-span-2">
            <LegDistributionCards
              legBalanceMatrix={matrixMetrics.legBalanceMatrix}
              spilloverMetrics={matrixMetrics.spilloverMetrics}
            />
          </div>
        </section>
      )}

      {/* ================================================================
          PRODUCT CATALOG
          ================================================================ */}

      <div className="space-y-6 mt-8">
        <h3 className="text-lg font-black text-slate-800 text-left">
          Active Storefront Catalog
        </h3>

        {products.length === 0 ? (
          <div className="py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200/60 p-6">
            <p className="font-medium">
              This brand has not initialized any marketplace
              listings yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((p) => {
              const productId = p.id || p._id;

              const imageUrl = p.imageUrl
                ? p.imageUrl.startsWith("http")
                  ? p.imageUrl
                  : `${API_URL}${p.imageUrl.startsWith("/") ? "" : "/"}${p.imageUrl}`
                : null;

              return (
                <div
                  key={productId}
                  onClick={() =>
                    navigate(
                      `/product-details/${productId}`
                    )
                  }
                  className="group bg-white border border-slate-200/70 rounded-2xl overflow-hidden shadow-xs hover:shadow-md hover:border-emerald-600/40 transition-all duration-200 cursor-pointer flex flex-col h-full text-left"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" ||
                      event.key === " "
                    ) {
                      navigate(
                        `/product-details/${productId}`
                      );
                    }
                  }}
                >
                  {/* Product Image */}
                  <div className="relative aspect-video w-full bg-slate-50 overflow-hidden border-b border-slate-100 shrink-0">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={p.name || "Product"}
                        onError={(event) => {
                          event.currentTarget.style.display =
                            "none";
                        }}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                        No image available
                      </div>
                    )}
                  </div>

                  {/* Product Details */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">
                        {p.category || "General"}
                      </p>

                      <h4 className="font-bold text-slate-900 mt-1 line-clamp-2">
                        {p.name || "Untitled Product"}
                      </h4>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-lg font-black text-slate-900">
                        KSh{" "}
                        {parseFloat(p.price || 0).toLocaleString()}
                      </span>

                      {p.quantity !== undefined && (
                        <span className="text-xs text-slate-400">
                          {p.quantity} available
                        </span>
                      )}
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

