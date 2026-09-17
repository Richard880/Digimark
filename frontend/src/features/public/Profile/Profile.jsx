
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import useAuth from "../../auth/hooks/useAuth";
import MatrixTreeChart from "../../vendor-dashboard/MatrixTreeChart";
import LegDistributionCards from "../../vendor-dashboard/LegDistributionCards";

// Dynamic API Environment Variable Mapping
const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000";

// Default settings route.
// Change this if your project uses a different route.
const MEMBER_SETTINGS_ROUTE = "/settings";

export default function Profile() {
  const { userId } = useParams();
  const navigate = useNavigate();

  // Authenticated session data
  const { auth } = useAuth();

  // Logged-in Firebase user
  const loggedInUser = auth?.currentUser;

  // Logged-in user's profile
  const loggedInProfile = auth?.profile || {};

  // Determine whether this is the logged-in user's own profile
  const isOwnProfile =
    !userId ||
    userId === loggedInUser?.uid ||
    userId === loggedInProfile?.id ||
    userId === auth?.user?.id ||
    userId === auth?.user?._id;

  const [brandProfile, setBrandProfile] = useState(null);
  const [matrixMetrics, setMatrixMetrics] = useState(null);
  const [products, setAllProducts] = useState([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // Resolve the active tracking identifier safely
    const activeTargetId = isOwnProfile
      ? loggedInProfile?.id ||
        loggedInProfile?._id ||
        auth?.user?.id ||
        auth?.user?._id ||
        loggedInUser?.uid
      : userId;

    if (!activeTargetId) {
      setIsLoading(false);
      return undefined;
    }

    const loadCompleteProfileSystem = async () => {
      try {
        setIsLoading(true);

        let resolvedProfile = null;
        let resolvedMatrixMetrics = null;

        /*
         * ================================================================
         * OWN PROFILE
         * ================================================================
         *
         * Hydrate the profile directly from AuthContext where possible.
         */
        if (isOwnProfile && loggedInUser) {
          resolvedProfile = {
            name:
              `${loggedInProfile?.firstName || ""} ${
                loggedInProfile?.lastName || ""
              }`.trim() ||
              loggedInProfile?.name ||
              loggedInUser?.displayName ||
              loggedInUser?.email ||
              "SokoDigi Member",

            username:
              loggedInProfile?.username ||
              loggedInUser?.email?.split("@")[0] ||
              "member",

            accountCategory:
              auth?.user?.accountCategory ||
              loggedInProfile?.accountCategory ||
              "network",

            membershipNumber:
              loggedInProfile?.membershipNumber ||
              auth?.user?.membershipNumber ||
              "PENDING",

            brandName:
              loggedInProfile?.brandName ||
              "SokoDigi Merchant",

            phoneNumber:
              loggedInProfile?.phoneNumber ||
              loggedInUser?.phoneNumber ||
              "",
          };

          if (auth?.matrixMetrics?.ok) {
            resolvedMatrixMetrics = auth.matrixMetrics;
          }
        } else {
          /*
           * ================================================================
           * PUBLIC / OTHER USER PROFILE
           * ================================================================
           */

          const profileRes = await fetch(
            `${API_URL}/api/products/market`
          );

          if (profileRes.ok) {
            const feedList = await profileRes.json();

            const safeFeedList = Array.isArray(feedList)
              ? feedList
              : Array.isArray(feedList?.products)
              ? feedList.products
              : [];

            const matchedItem = safeFeedList.find(
              (product) =>
                product?.shopId === activeTargetId ||
                product?.userId === activeTargetId ||
                product?.ownerId === activeTargetId
            );

            resolvedProfile = matchedItem
              ? {
                  name:
                    matchedItem.displayName ||
                    matchedItem.name ||
                    "SokoDigi Merchant",

                  username:
                    matchedItem.username ||
                    "merchant",

                  accountCategory:
                    matchedItem.accountCategory ||
                    "retail",

                  membershipNumber:
                    matchedItem.membershipNumber ||
                    "N/A",

                  brandName:
                    matchedItem.brandName ||
                    "",

                  phoneNumber:
                    matchedItem.phoneNumber ||
                    "",
                }
              : {
                  name: "Independent Brand Store",
                  username: "merchant",
                  accountCategory: "retail",
                  membershipNumber: "N/A",
                  brandName: "",
                  phoneNumber: "",
                };
          } else {
            resolvedProfile = {
              name: "Independent Brand Store",
              username: "merchant",
              accountCategory: "retail",
              membershipNumber: "N/A",
              brandName: "",
              phoneNumber: "",
            };
          }
        }

        if (!isMounted) {
          return;
        }

        setBrandProfile(resolvedProfile);

        /*
         * ================================================================
         * MATRIX METRICS
         * ================================================================
         *
         * Use AuthContext data first. If unavailable, request fresh
         * metrics from the backend.
         */
        const token = loggedInUser
          ? await loggedInUser.getIdToken().catch(() => null)
          : null;

        const headers = token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {};

        if (
          !resolvedMatrixMetrics &&
          (isOwnProfile ||
            resolvedProfile?.accountCategory === "network")
        ) {
          const metricsRes = await fetch(
            `${API_URL}/api/network/matrix-metrics`,
            {
              headers,
            }
          );

          if (metricsRes.ok) {
            const metricsData = await metricsRes.json();

            if (metricsData?.ok) {
              resolvedMatrixMetrics = metricsData;
            }
          }
        }

        if (!isMounted) {
          return;
        }

        if (resolvedMatrixMetrics) {
          setMatrixMetrics(resolvedMatrixMetrics);
        }

        /*
         * ================================================================
         * PRODUCTS
         * ================================================================
         */

        const response = await fetch(
          `${API_URL}/api/products?shopId=${encodeURIComponent(
            activeTargetId
          )}`
        );

        if (response.ok) {
          const data = await response.json();

          const productList = Array.isArray(data)
            ? data
            : Array.isArray(data?.products)
            ? data.products
            : [];

          if (isMounted) {
            setAllProducts(productList);
          }
        } else if (isMounted) {
          setAllProducts([]);
        }
      } catch (error) {
        console.error(
          "❌ Profile data loading failure:",
          error
        );

        if (isMounted) {
          setAllProducts([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadCompleteProfileSystem();

    return () => {
      isMounted = false;
    };
  }, [
    userId,
    isOwnProfile,
    loggedInUser,
    loggedInProfile,
    auth,
  ]);

  /*
   * ================================================================
   * LOADING STATE
   * ================================================================
   */

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center space-y-3 bg-slate-50/30 py-32 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-600/10 border-t-emerald-600" />

        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Hydrating Profile Core Data...
        </p>
      </div>
    );
  }

  /*
   * ================================================================
   * PROFILE PAGE
   * ================================================================
   */

  return (
    <div className="mx-auto min-h-screen max-w-4xl bg-white px-4 py-8 text-left md:py-12">
      {/* ================================================================
          INSTAGRAM-INSPIRED AUTHOR MASTER HEADER
          ================================================================ */}

      <header className="flex flex-col items-center gap-8 border-b border-slate-100 pb-10 md:flex-row md:items-start md:gap-16">
        {/* ============================================================
            LEFT SIDE: PROFILE AVATAR
            ============================================================ */}

        <div className="relative shrink-0">
          <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-slate-200 bg-slate-50 p-1 md:h-36 md:w-36">
            <div className="flex h-full w-full items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-700 shadow-inner">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-12 w-12 md:h-16 md:w-16"
                aria-hidden="true"
              >
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
          </div>
        </div>

        {/* ============================================================
            RIGHT SIDE: IDENTITY CORE
            ============================================================ */}

        <div className="w-full flex-1 space-y-5 text-center md:text-left">
          {/* Action Row */}

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row md:justify-start">
            <h2 className="text-xl font-light tracking-tight text-slate-800">
              {brandProfile?.username || "sokodigi_member"}
            </h2>

            {isOwnProfile ? (
              <button
                type="button"
                onClick={() => navigate(MEMBER_SETTINGS_ROUTE)}
                className="rounded-md border border-slate-300 bg-white px-6 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Edit Profile
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setIsSubscribed((previous) => !previous)
                }
                className={`rounded-md px-6 py-1.5 text-xs font-bold transition ${
                  isSubscribed
                    ? "border border-slate-200 bg-slate-100 text-slate-600"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                {isSubscribed
                  ? "✓ Subscribed"
                  : "Subscribe"}
              </button>
            )}
          </div>

          {/* ==========================================================
              PROFILE STATISTICS
              ========================================================== */}

          <ul className="flex items-center justify-center gap-8 border-y border-slate-50 py-3 text-sm md:justify-start md:border-none md:py-0 md:text-base">
            <li>
              <span className="font-bold text-slate-900">
                {products.length}
              </span>{" "}
              <span className="font-medium text-slate-500">
                listings
              </span>
            </li>

            <li>
              <span className="font-bold text-slate-900">
                {matrixMetrics?.summary?.totalDownline?.toLocaleString() ||
                  0}
              </span>{" "}
              <span className="font-medium text-slate-500">
                network members
              </span>
            </li>

            <li>
              <span className="font-bold text-slate-900">
                {matrixMetrics?.spilloverMetrics
                  ?.totalSpillovers || 0}
              </span>{" "}
              <span className="font-medium text-slate-500">
                spillovers
              </span>
            </li>
          </ul>

          {/* ==========================================================
              PROFILE DESCRIPTION
              ========================================================== */}

          <div className="space-y-1 text-sm">
            <h1 className="text-base font-bold text-slate-800">
              {brandProfile?.name || "SokoDigi Member"}
            </h1>

            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Track:{" "}
              {brandProfile?.accountCategory ||
                "Retail Store"}
            </p>

            {brandProfile?.brandName && (
              <p className="text-xs text-slate-500">
                {brandProfile.brandName}
              </p>
            )}

            {brandProfile?.membershipNumber && (
              <p className="font-mono text-xs text-slate-400">
                ID reference: #
                {brandProfile.membershipNumber}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* ================================================================
          MATRIX VISUALIZATION DECK
          ================================================================ */}

      {matrixMetrics?.ok && isOwnProfile && (
        <section className="my-10 grid grid-cols-1 gap-6 border-b border-slate-100 pb-10 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <MatrixTreeChart
              generations={matrixMetrics.generations}
            />
          </div>

          <div className="lg:col-span-2">
            <LegDistributionCards
              legBalanceMatrix={
                matrixMetrics.legBalanceMatrix
              }
              spilloverMetrics={
                matrixMetrics.spilloverMetrics
              }
            />
          </div>
        </section>
      )}

      {/* ================================================================
          PRODUCT CATALOG GRID
          ================================================================ */}

      <section className="mt-10">
        <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
            Storefront Posts
          </h2>

          <span className="text-xs font-medium text-slate-400">
            {products.length}{" "}
            {products.length === 1 ? "item" : "items"}
          </span>
        </div>

        {products.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-16 text-center">
            <p className="text-sm text-slate-500">
              This merchant profile has not initialized
              any marketplace catalog posts yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
            {products.map((product) => {
              const productId =
                product?.id || product?._id;

              const imageUrl =
                product?.imageUrl ||
                product?.image ||
                product?.thumbnail ||
                "";

              let fullImageUrl = imageUrl;

              if (
                imageUrl &&
                !imageUrl.startsWith("http://") &&
                !imageUrl.startsWith("https://") &&
                !imageUrl.startsWith("data:")
              ) {
                const fileName = imageUrl
                  .split("/")
                  .pop();

                fullImageUrl = `${API_URL}/images/${fileName}`;
              }

              return (
                <article
                  key={productId}
                  onClick={() => {
                    if (productId) {
                      navigate(
                        `/product-details/${productId}`
                      );
                    }
                  }}
                  className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-lg border border-slate-100 bg-white text-left shadow-sm transition-all duration-200 hover:border-emerald-600/30 hover:shadow-md"
                >
                  {/* Product Image */}

                  <div className="aspect-square w-full overflow-hidden bg-slate-100">
                    {fullImageUrl ? (
                      <img
                        src={fullImageUrl}
                        alt={
                          product?.name ||
                          "SokoDigi product"
                        }
                        onError={(event) => {
                          event.currentTarget.style.display =
                            "none";
                        }}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.01]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                        No image available
                      </div>
                    )}
                  </div>

                  {/* Product Information */}

                  <div className="flex flex-1 flex-col p-4">
                    <span className="mb-2 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      {product?.category || "General"}
                    </span>

                    <h3 className="line-clamp-2 text-sm font-semibold text-slate-800">
                      {product?.name ||
                        "Untitled Product"}
                    </h3>

                    <div className="mt-auto pt-4">
                      <p className="text-xs font-medium text-slate-400">
                        Value
                      </p>

                      <p className="mt-1 text-sm font-bold text-slate-900">
                        Ksh{" "}
                        {Number(
                          product?.price || 0
                        ).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
