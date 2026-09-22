
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import useAuth from "../../auth/hooks/useAuth";
import MatrixTreeChart from "../../vendor-dashboard/MatrixTreeChart";
import LegDistributionCards from "../../vendor-dashboard/LegDistributionCards";

import AvatarMenuModal from "./AvatarMenuModal";
import { uploadImageToCloudinary } from "../../../utils/cloudinaryUploader";

import styles from "./Profile.module.css";

// ============================================================================
// API CONFIGURATION
// ============================================================================

const API_URL = import.meta.env.PROD
  ? ""
  : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(
      /\/$/,
      ""
    );

const MEMBER_SETTINGS_ROUTE = "/settings";
const NETWORK_DASHBOARD_ROUTE = "/dashboard/network";

// ============================================================================
// PROFILE COMPONENT
// ============================================================================

export default function Profile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { auth } = useAuth();

  const fileInputRef = useRef(null);

  // ==========================================================================
  // AUTH / USER CONTEXT
  // ==========================================================================

  const loggedInUser = auth?.currentUser;
  const loggedInProfile = auth?.profile || {};
  
  
 

  // ==========================================================================
  // STATE
  // ==========================================================================

  const [brandProfile, setBrandProfile] = useState(null);
  const [matrixMetrics, setMatrixMetrics] = useState(null);
  const [products, setProducts] = useState([]);
  const [sharedProducts, setSharedProducts] = useState([]);
  const [myOrdersList, setMyOrdersList] = useState([]);

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("products");
  const [shareMessage, setShareMessage] = useState("");

  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);

  // ==========================================================================
  // ACTIVE PROFILE IDENTIFIER
  // ==========================================================================

  const activeTargetId = isOwnProfile
    ? loggedInProfile?.id ||
      loggedInProfile?._id ||
      auth?.user?.id ||
      auth?.user?._id ||
      loggedInUser?.uid
    : userId;

  // ==========================================================================
  // FETCH ORDERS
  // ==========================================================================

  const fetchOrders = async () => {
    try {
      const token = loggedInUser?.getIdToken
        ? await loggedInUser.getIdToken()
        : null;

      const response = await fetch(`${API_URL}/api/orders`, {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
      });

      if (response.ok) {
        const data = await response.json();

        setMyOrdersList(
          Array.isArray(data)
            ? data
            : data?.orders || []
        );
      } else {
        setMyOrdersList([]);
        console.error(
          "Failed to fetch orders:",
          response.status
        );
      }
    } catch (err) {
      console.error("Error fetching orders:", err);
      setMyOrdersList([]);
    }
  };

  // ==========================================================================
  // FETCH SHARED PRODUCTS
  // ==========================================================================

  const fetchSharedProducts = async () => {
    try {
      const token = loggedInUser?.getIdToken
        ? await loggedInUser.getIdToken()
        : null;

      const response = await fetch(
        `${API_URL}/api/shared-products`,
        {
          headers: token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {},
        }
      );

      if (response.ok) {
        const data = await response.json();

        setSharedProducts(
          Array.isArray(data)
            ? data
            : data?.products || []
        );
      } else {
        setSharedProducts([]);

        console.error(
          "Failed to load shared products:",
          response.status
        );
      }
    } catch (error) {
      console.error(
        "Error fetching shared products:",
        error
      );

      setSharedProducts([]);
    }
  };

  // ==========================================================================
  // AVATAR UPLOAD
  // ==========================================================================

  const handleAvatarFileChange = async (event) => {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    if (!selectedFile.type.startsWith("image/")) {
      alert("Please select a valid image file.");
      event.target.value = "";
      return;
    }

    if (selectedFile.size > 2 * 1024 * 1024) {
      alert(
        "Profile picture files are restricted to a maximum size of 2MB."
      );

      event.target.value = "";
      return;
    }

    setIsUpdatingAvatar(true);

    try {
      const currentUser = auth?.currentUser;

      if (!currentUser) {
        throw new Error(
          "Your session has expired. Please sign in again."
        );
      }

      console.log(
        "Starting profile image upload to Cloudinary..."
      );

      const uploadedUrl = await uploadImageToCloudinary(
        selectedFile,
        "profiles"
      );

      if (
        typeof uploadedUrl !== "string" ||
        uploadedUrl.trim() === ""
      ) {
        throw new Error(
          "Upload pipeline failed to resolve an image URL."
        );
      }

      // Immediately update visible profile.
      setBrandProfile((previousProfile) => ({
        ...(previousProfile || {}),
        photoURL: uploadedUrl,
        profilePic: uploadedUrl,
        profilePhoto: uploadedUrl,
      }));

      const token = await currentUser.getIdToken();

      const profileResponse = await fetch(
        `${API_URL}/api/auth/sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            profilePic: uploadedUrl,
            photoURL: uploadedUrl,
            profilePhoto: uploadedUrl,

            userData: {
              profilePic: uploadedUrl,
              photoURL: uploadedUrl,
              profilePhoto: uploadedUrl,
            },
          }),
        }
      );

      if (!profileResponse.ok) {
        const responseText =
          await profileResponse.text();

        throw new Error(
          `Profile sync failed: ${profileResponse.status} ${responseText}`
        );
      }

      console.log(
        "Profile avatar changes synced successfully."
      );

      setIsAvatarModalOpen(false);

      window.dispatchEvent(
        new CustomEvent("profile-avatar-updated", {
          detail: {
            profilePic: uploadedUrl,
            photoURL: uploadedUrl,
            profilePhoto: uploadedUrl,
          },
        })
      );
    } catch (error) {
      console.error(
        "Avatar synchronization error:",
        error
      );

      alert(
        error?.message ||
          "Unable to update the profile picture."
      );
    } finally {
      setIsUpdatingAvatar(false);
      event.target.value = "";
    }
  };

  // ==========================================================================
  // TAB EFFECTS
  // ==========================================================================

  useEffect(() => {
    if (activeTab === "orders" && isOwnProfile) {
      fetchOrders();
    }
  }, [activeTab, isOwnProfile]);

  useEffect(() => {
    if (activeTab === "shared") {
      fetchSharedProducts();
    }
  }, [activeTab]);

  // ==========================================================================
  // LOAD PROFILE
  // ==========================================================================

  useEffect(() => {
    let isMounted = true;

 

    if (!activeTargetId) {
      setIsLoading(false);
      setProducts([]);
      setBrandProfile(null);
      return undefined;
    }

    const loadProfile = async () => {
      try {
        setIsLoading(true);

        let brandProfile = null;
        let resolvedMatrixMetrics = null;

  
        // ====================================================================
        // OWN PROFILE
        // ====================================================================

        if (isOwnProfile && loggedInUser) {
          const accountCategory =
            loggedInProfile?.accountCategory ||
            auth?.user?.accountCategory ||
            "retail";

          brandProfile = {
            id: activeTargetId,

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

            accountCategory,

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

            bio:
              loggedInProfile?.bio ||
              loggedInProfile?.description ||
              "",

            photoURL:
              loggedInProfile?.profilePhoto ||
              loggedInProfile?.photoURL ||
              loggedInProfile?.profilePic ||
              loggedInUser?.photoURL ||
              "",

            profilePic:
              loggedInProfile?.profilePic ||
              loggedInProfile?.photoURL ||
              loggedInProfile?.profilePhoto ||
              loggedInUser?.photoURL ||
              "",

            profilePhoto:
              loggedInProfile?.profilePhoto ||
              loggedInProfile?.photoURL ||
              loggedInProfile?.profilePic ||
              loggedInUser?.photoURL ||
              "",

            networkLevel:
              loggedInProfile?.networkLevel ||
              loggedInProfile?.marketerLevel ||
              null,

            subscribers:
              loggedInProfile?.subscriberCount || 0,

            subscriptions:
              loggedInProfile?.subscriptionCount || 0,
          };

          // ================================================================
          // MATRIX METRICS
          // ================================================================
if (accountCategory === "network") {
  try {
    const token = loggedInUser?.getIdToken 
      ? await loggedInUser.getIdToken() 
      : (auth?.token || auth?.accessToken || null);

    if (token) {
      const metricsResponse = await fetch(
        `${API_URL}/api/network/matrix-metrics`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (metricsResponse.ok) {
        resolvedMatrixMetrics = await metricsResponse.json();
      }
    } else {
      console.warn("Skipping matrix metrics fetch: No auth token could be resolved.");
    }
  } catch (metricsError) {
    console.error(
      "Delayed matrix aggregation lookup error:",
      metricsError
    );
  }
}    } else {
          // ==================================================================
          // PUBLIC PROFILE
          // ==================================================================

          const response = await fetch(
            `${API_URL}/api/profiles/${encodeURIComponent(
              activeTargetId
            )}`
          );

          if (response.ok) {
            resolvedProfile =
              await response.json();
          } else {
            // ================================================================
            // LEGACY MARKET FALLBACK
            // ================================================================

            const marketResponse = await fetch(
              `${API_URL}/api/products/market`
            );

            if (marketResponse.ok) {
              const feedData =
                await marketResponse.json();

              const feedList = Array.isArray(feedData)
                ? feedData
                : feedData?.products || [];

              const matchedItem = feedList.find(
                (p) =>
                  p?.shopId === activeTargetId ||
                  p?.userId === activeTargetId
              );

              if (matchedItem) {
                brandProfile = {
                  id: activeTargetId,

                  name:
                    matchedItem?.displayName ||
                    matchedItem?.sellerName ||
                    "SokoDigi Merchant",

                  username:
                    matchedItem?.username ||
                    "merchant",

                  accountCategory:
                    matchedItem?.accountCategory ||
                    "retail",

                  membershipNumber:
                    matchedItem?.membershipNumber ||
                    "N/A",

                  brandName:
                    matchedItem?.brandName || "",

                  phoneNumber:
                    matchedItem?.phoneNumber || "",

                  bio:
                    matchedItem?.bio || "",

                  profilePic:
                    matchedItem?.photoURL ||
                    matchedItem?.profilePhoto ||
                    matchedItem?.profilePic ||
                    "",

                  profilePhoto:
                    matchedItem?.profilePhoto ||
                    matchedItem?.photoURL ||
                    matchedItem?.profilePic ||
                    "",

                  photoURL:
                    matchedItem?.photoURL ||
                    matchedItem?.profilePhoto ||
                    matchedItem?.profilePic ||
                    "",

                  networkLevel:
                    matchedItem?.networkLevel || null,

                  subscribers:
                    matchedItem?.subscriberCount || 0,

                  subscriptions:
                    matchedItem?.subscriptionCount || 0,
                };
              }
            }
          }
        }

        // ====================================================================
        // PRODUCTS
        // ====================================================================

        const productsResponse = await fetch(
          `${API_URL}/api/products?shopId=${encodeURIComponent(
            activeTargetId
          )}`
        );

        let resolvedProducts = [];

        if (productsResponse.ok) {
          const productsData =
            await productsResponse.json();

          resolvedProducts = Array.isArray(productsData)
            ? productsData
            : Array.isArray(productsData?.products)
            ? productsData.products
            : [];
        }

        // ====================================================================
        // APPLY RESULTS
        // ====================================================================

        if (!isMounted) {
          return;
        }

        setBrandProfile(brandProfile);
        setMatrixMetrics(resolvedMatrixMetrics);
        setProducts(resolvedProducts);
      } catch (error) {
        console.error(
          "SokoDigi profile loading error:",
          error
        );

        if (isMounted) {
          setProducts([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
   }, [
    userId,
    isOwnProfile,
    activeTargetId,
    loggedInUser?.uid,
    loggedInProfile?.id,
    loggedInProfile?._id,
  ]);

  // ==========================================================================
  // NETWORK LEVEL
  // ==========================================================================

  const networkLevel = useMemo(() => {
    const possibleLevels = [
      brandProfile?.networkLevel,
      matrixMetrics?.networkLevel,
      matrixMetrics?.marketerLevel,
      matrixMetrics?.level,
      matrixMetrics?.summary?.networkLevel,
      matrixMetrics?.summary?.marketerLevel,
      matrixMetrics?.summary?.level,
    ];

    const foundLevel = possibleLevels.find(
      (value) =>
        value !== null &&
        value !== undefined &&
        value !== ""
    );

    const numericLevel = Number(foundLevel);

    return Number.isFinite(numericLevel) &&
      numericLevel > 0
      ? numericLevel
      : null;
  }, [brandProfile, matrixMetrics]);

  // ==========================================================================
  // NETWORK LEVEL PRESENTATION
  // ==========================================================================

  const levelInfo = useMemo(() => {
    if (!networkLevel) {
      return {
        name: "Member",
        shortName: "MEMBER",
        ring: "border-slate-300",
        badge:
          "bg-slate-100 text-slate-600 border-slate-200",
        dot: "bg-slate-400",
      };
    }

    if (networkLevel >= 4) {
      return {
        name: "Level 4 Network",
        shortName: "LEVEL 4",
        ring: "border-amber-400",
        badge:
          "bg-amber-50 text-amber-700 border-amber-200",
        dot: "bg-amber-500",
      };
    }

    if (networkLevel === 3) {
      return {
        name: "Level 3 Network",
        shortName: "LEVEL 3",
        ring: "border-purple-500",
        badge:
          "bg-purple-50 text-purple-700 border-purple-200",
        dot: "bg-purple-500",
      };
    }

    if (networkLevel === 2) {
      return {
        name: "Level 2 Network",
        shortName: "LEVEL 2",
        ring: "border-blue-500",
        badge:
          "bg-blue-50 text-blue-700 border-blue-200",
        dot: "bg-blue-500",
      };
    }

    return {
      name: "Level 1 Network",
      shortName: "LEVEL 1",
      ring: "border-emerald-500",
      badge:
        "bg-emerald-50 text-emerald-700 border-emerald-200",
      dot: "bg-emerald-500",
    };
  }, [networkLevel]);

  // ==========================================================================
  // NETWORK MEMBERS
  // ==========================================================================

  const networkMembers =
    matrixMetrics?.summary?.totalDownline ??
    matrixMetrics?.summary?.totalMembers ??
    matrixMetrics?.totalDownline ??
    matrixMetrics?.totalMembers ??
    0;

  const subscribers =
    Number(brandProfile?.subscribers) || 0;

  // ==========================================================================
  // PROFILE SHARE
  // ==========================================================================

  const handleShareProfile = async () => {
    try {
      const profileUrl = window.location.href;

      if (navigator.share) {
        await navigator.share({
          title: `${
            brandProfile?.name || "SokoDigi Member"
          } | SokoDigi`,
          text: `View ${
            brandProfile?.name || "this member"
          } on SokoDigi.`,
          url: profileUrl,
        });

        return;
      }

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(
          profileUrl
        );

        setShareMessage("Profile link copied");

        window.setTimeout(() => {
          setShareMessage("");
        }, 2500);
      }
    } catch (error) {
      console.warn(
        "Profile sharing cancelled or unavailable:",
        error
      );
    }
  };

  // ==========================================================================
  // PRODUCT IMAGE URL
  // ==========================================================================

  const getProductImageUrl = (product) => {
    const imageUrl =
      product?.imageUrl ||
      product?.image ||
      product?.thumbnail ||
      "";

    if (
      !imageUrl ||
      imageUrl.startsWith("http://") ||
      imageUrl.startsWith("https://") ||
      imageUrl.startsWith("data:")
    ) {
      return imageUrl;
    }

    const fileName = imageUrl.split("/").pop();

    return `${API_URL}/images/${fileName}`;
  };

  // ==========================================================================
  // AVATAR URL
  // ==========================================================================

  const profileImage =
    brandProfile?.photoURL ||
    brandProfile?.profilePhoto ||
    brandProfile?.profilePic ||
    "";

  // ==========================================================================
  // LOADING STATE
  // ==========================================================================

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <div className="h-11 w-11 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" />

        <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
          Loading SokoDigi Profile
        </p>
      </div>
    );
  }

  // ==========================================================================
  // MAIN RENDER
  // ==========================================================================

  return (
    <main className="min-h-screen bg-slate-50/60">
      {/* ================================================================
          HIDDEN IMAGE UPLOAD INPUT
          ================================================================ */}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleAvatarFileChange}
        className="hidden"
      />

      {/* ================================================================
          AVATAR MENU MODAL
          ================================================================ */}

      <AvatarMenuModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        currentImageUrl={profileImage}
        isOwnProfile={isOwnProfile}
        onUploadClick={() =>
          fileInputRef.current?.click()
        }
      />

      {/* ================================================================
          PROFILE CONTENT
          ================================================================ */}

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 md:py-10">
        {/* ==============================================================
            PROFILE HEADER
            ============================================================== */}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {/* Cover / top banner */}
          <div className="h-32 bg-gradient-to-r from-emerald-950 via-emerald-800 to-emerald-600 sm:h-40" />

          {/* Profile information */}
          <div className="relative px-5 pb-6 sm:px-8">
            <div className="-mt-14 flex flex-col gap-5 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
              {/* Avatar + identity */}
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end">
                <button
                  type="button"
                  onClick={() =>
                    isOwnProfile &&
                    setIsAvatarModalOpen(true)
                  }
                  className={`relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 bg-white shadow-lg sm:h-32 sm:w-32 ${levelInfo.ring} ${
                    isOwnProfile
                      ? "cursor-pointer"
                      : "cursor-default"
                  }`}
                  title={
                    isOwnProfile
                      ? "Manage profile picture"
                      : "Profile picture"
                  }
                >
                  {profileImage ? (
                    <img
                      src={profileImage}
                      alt={
                        brandProfile?.name ||
                        "SokoDigi Member"
                      }
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-emerald-50 text-4xl font-black text-emerald-700">
                      {(
                        brandProfile?.name ||
                        "S"
                      )
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                  )}

                  {isUpdatingAvatar && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <div className="h-7 w-7 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    </div>
                  )}
                </button>

                <div className="pb-1 text-center sm:text-left">
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <h1 className="text-2xl font-black tracking-tight text-slate-900">
                      {brandProfile?.name ||
                        "SokoDigi Member"}
                    </h1>

                    {isOwnProfile && (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-700">
                        You
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-sm font-medium text-slate-500">
                    @{brandProfile?.username ||
                      "member"}
                  </p>

                  {brandProfile?.brandName && (
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {brandProfile.brandName}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${levelInfo.badge}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${levelInfo.dot}`}
                      />
                      {levelInfo.shortName}
                    </span>

                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {brandProfile?.accountCategory ||
                        "retail"}
                    </span>

                    {brandProfile?.membershipNumber && (
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-mono text-[10px] font-bold text-slate-500">
                        #{brandProfile.membershipNumber}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Header actions */}
              <div className="flex flex-wrap justify-center gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={handleShareProfile}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"
                >
                  Share
                </button>

                {isOwnProfile ? (
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        MEMBER_SETTINGS_ROUTE
                      )
                    }
                    className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-800"
                  >
                    Edit Profile
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setIsSubscribed(
                        (previous) => !previous
                      )
                    }
                    className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                      isSubscribed
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "bg-emerald-700 text-white hover:bg-emerald-800"
                    }`}
                  >
                    {isSubscribed
                      ? "✓ Subscribed"
                      : "Subscribe"}
                  </button>
                )}
              </div>
            </div>

            {/* Bio */}
            {brandProfile?.bio && (
              <div className="mt-6 max-w-3xl">
                <p className="text-sm leading-6 text-slate-600">
                  {brandProfile.bio}
                </p>
              </div>
            )}

            {/* Profile statistics */}
            <div className="mt-6 grid grid-cols-2 divide-x overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 sm:grid-cols-4">
              <div className="px-4 py-4 text-center">
                <p className="text-xl font-black text-slate-900">
                  {products.length}
                </p>
                <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-400">
                  Products
                </p>
              </div>

              <div className="px-4 py-4 text-center">
                <p className="text-xl font-black text-slate-900">
                  {subscribers}
                </p>
                <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-400">
                  Subscribers
                </p>
              </div>

              <div className="px-4 py-4 text-center">
                <p className="text-xl font-black text-slate-900">
                  {networkMembers}
                </p>
                <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-400">
                  Network Members
                </p>
              </div>

              <div className="px-4 py-4 text-center">
                <p className="text-xl font-black text-emerald-700">
                  {networkLevel || "—"}
                </p>
                <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-400">
                  Network Level
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Share confirmation */}
        {shareMessage && (
          <div className="mt-3 text-center text-xs font-bold text-emerald-700">
            {shareMessage}
          </div>
        )}

        {/* ==============================================================
            NETWORK METRICS
            ============================================================== */}

        {matrixMetrics?.ok && (
          <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Total Network Downline
              </p>

              <p className="mt-2 text-2xl font-black text-slate-900">
                {matrixMetrics.summary
                  ?.totalDownline || 0}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Active Nodes
              </p>

              <p className="mt-2 text-2xl font-black text-emerald-600">
                {matrixMetrics.summary
                  ?.activeDownline || 0}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Matrix Spillover Rate
              </p>

              <p className="mt-2 text-2xl font-black text-slate-900">
                {matrixMetrics.spilloverMetrics
                  ?.spilloverRatePercentage || 0}
                %
              </p>
            </div>
          </section>
        )}

        {/* ==============================================================
            MATRIX VISUALIZATION
            ============================================================== */}

        {matrixMetrics?.ok && (
          <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <MatrixTreeChart
                generations={
                  matrixMetrics.generations
                }
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

        {/* ==============================================================
            TABS
            ============================================================== */}

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto border-b border-slate-100">
            <div className="flex min-w-max">
              {[
                {
                  id: "products",
                  label: "Products",
                },
                {
                  id: "shared",
                  label: "Shared Store",
                },
                ...(isOwnProfile
                  ? [
                      {
                        id: "orders",
                        label: "Orders",
                      },
                    ]
                  : []),
                {
                  id: "about",
                  label: "About",
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() =>
                    setActiveTab(tab.id)
                  }
                  className={`border-b-2 px-5 py-4 text-xs font-black transition ${
                    activeTab === tab.id
                      ? "border-emerald-600 text-emerald-700"
                      : "border-transparent text-slate-400 hover:text-slate-700"
                  }`}
                >
                  {tab.label}

                  {tab.id === "products" && (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] text-slate-500">
                      {products.length}
                    </span>
                  )}

                  {tab.id === "orders" &&
                    myOrdersList.length > 0 && (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] text-emerald-700">
                        {myOrdersList.length}
                      </span>
                    )}
                </button>
              ))}
            </div>
          </div>

          {/* ============================================================
              PRODUCTS TAB
              ============================================================ */}

          {activeTab === "products" && (
            <section className="p-5 sm:p-7">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900">
                    Active Storefront
                  </h2>

                  <p className="mt-1 text-xs text-slate-400">
                    Products currently displayed by this
                    SokoDigi merchant.
                  </p>
                </div>

                {isOwnProfile && (
                  <button
                    type="button"
                    onClick={() =>
                      navigate("/dashboard")
                    }
                    className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                  >
                    Manage Store
                  </button>
                )}
              </div>

              {products.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl shadow-sm">
                    🛍️
                  </div>

                  <h3 className="mt-4 text-sm font-black text-slate-700">
                    No products yet
                  </h3>

                  <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-400">
                    This storefront has not initialized
                    any marketplace listings yet.
                  </p>

                  {isOwnProfile && (
                    <button
                      type="button"
                      onClick={() =>
                        navigate("/dashboard")
                      }
                      className="mt-5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white"
                    >
                      Add Products
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {products.map((product) => {
                    const productId =
                      product?.id ||
                      product?._id;

                    const imageUrl =
                      getProductImageUrl(product);

                    return (
                      <article
                        key={productId}
                        className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              `/product-details/${productId}`
                            )
                          }
                          className="block w-full text-left"
                        >
                          <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={
                                  product?.name ||
                                  "Product"
                                }
                                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                                onError={(event) => {
                                  event.currentTarget.style.display =
                                    "none";
                                }}
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs font-bold text-slate-400">
                                No image available
                              </div>
                            )}
                          </div>

                          <div className="p-4">
                            <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">
                              {product?.category ||
                                "General"}
                            </p>

                            <h3 className="mt-1 line-clamp-2 text-sm font-black text-slate-900">
                              {product?.name ||
                                "Untitled Product"}
                            </h3>

                            <div className="mt-4 flex items-center justify-between gap-3">
                              <span className="text-lg font-black text-slate-900">
                                KSh{" "}
                                {Number(
                                  product?.price || 0
                                ).toLocaleString()}
                              </span>

                              {product?.quantity !==
                                undefined && (
                                <span className="text-[10px] font-semibold text-slate-400">
                                  {product.quantity}{" "}
                                  available
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* ============================================================
              SHARED STORE TAB
              ============================================================ */}

          {activeTab === "shared" && (
            <section className="p-5 sm:p-7">
              <div className="mb-5">
                <h2 className="text-lg font-black text-slate-900">
                  Shared Store
                </h2>

                <p className="mt-1 text-xs text-slate-400">
                  Products this storefront has re-pinned or
                  shared from partner shops.
                </p>
              </div>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {sharedProducts.length > 0 ? (
                  sharedProducts.map((item) => {
                    const product =
                      item?.productId;

                    const productImage =
                      product?.imageUrl ||
                      product?.image ||
                      "";

                    return (
                      <div
                        key={
                          item?._id ||
                          product?._id ||
                          Math.random()
                        }
                        className="overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        {productImage ? (
                          <img
                            src={productImage}
                            alt={
                              product?.name ||
                              "Shared product"
                            }
                            className="h-40 w-full rounded-lg object-cover"
                            crossOrigin="anonymous"
                          />
                        ) : (
                          <div className="flex h-40 w-full items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-400">
                            No image available
                          </div>
                        )}

                        <h3 className="mt-3 text-sm font-bold text-slate-800">
                          {product?.name ||
                            "Shared Product"}
                        </h3>

                        <p className="text-xs font-medium text-slate-400">
                          By{" "}
                          {product?.brandName ||
                            "Partner Shop"}
                        </p>

                        <div className="mt-3 flex items-center justify-between border-t border-slate-50 pt-2">
                          <span className="text-sm font-black text-slate-900">
                            KES{" "}
                            {Number(
                              product?.price || 0
                            ).toLocaleString()}
                          </span>

                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-extrabold uppercase text-amber-700">
                            Affiliate Pick
                          </span>
                        </div>

                        {item?.customNotes && (
                          <p className="mt-2 rounded bg-slate-50 p-2 text-[11px] italic text-slate-500">
                            💡 "{item.customNotes}"
                          </p>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-full py-12 text-center text-xs text-slate-400">
                    No re-pinned catalog products listed
                    on this storefront yet.
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ============================================================
              ORDERS TAB
              ============================================================ */}

          {activeTab === "orders" &&
            isOwnProfile && (
              <section className="p-5 sm:p-7">
                <h2 className="text-lg font-black text-slate-900">
                  My Purchase Receipts
                </h2>

                <p className="mt-1 text-xs text-slate-400">
                  View your product delivery slips, active
                  packages, and secure order information.
                </p>

                <div className="mt-6 grid gap-6 md:grid-cols-2">
                  {myOrdersList.length > 0 ? (
                    myOrdersList.map((order) => (
                      <OrderCardDetails
                        key={
                          order?._id ||
                          order?.id
                        }
                        order={order}
                      />
                    ))
                  ) : (
                    <div className="col-span-full rounded-2xl border border-slate-100 bg-white py-12 text-center text-xs text-slate-400">
                      You haven't purchased any items
                      from the MarketHub yet.
                    </div>
                  )}
                </div>
              </section>
            )}

          {/* ============================================================
              ABOUT TAB
              ============================================================ */}

          {activeTab === "about" && (
            <section className="p-5 sm:p-7">
              <div className="rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 p-5">
                  <h2 className="text-lg font-black text-slate-900">
                    About{" "}
                    {brandProfile?.name ||
                      "this member"}
                  </h2>
                </div>

                <div className="grid gap-6 p-5 sm:grid-cols-2">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      Username
                    </p>

                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      @{brandProfile?.username ||
                        "member"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      Account Type
                    </p>

                    <p className="mt-1 text-sm font-semibold capitalize text-slate-800">
                      {brandProfile?.accountCategory ||
                        "retail"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      Membership Number
                    </p>

                    <p className="mt-1 font-mono text-sm font-semibold text-slate-800">
                      {brandProfile?.membershipNumber ||
                        "N/A"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      Network Level
                    </p>

                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {levelInfo.name}
                    </p>
                  </div>

                  {brandProfile?.phoneNumber && (
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                        Phone
                      </p>

                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {brandProfile.phoneNumber}
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      Subscribers
                    </p>

                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {subscribers}
                    </p>
                  </div>
                </div>

                {brandProfile?.bio && (
                  <div className="border-t border-slate-100 p-5">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      Bio
                    </p>

                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                      {brandProfile.bio}
                    </p>
                  </div>
                )}

                {isOwnProfile && (
                  <div className="border-t border-slate-100 bg-slate-50 p-5">
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          MEMBER_SETTINGS_ROUTE
                        )
                      }
                      className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                    >
                      Manage Account Settings
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}
        </section>

        {/* ==============================================================
            NETWORK ACTION
            ============================================================== */}

        {isOwnProfile &&
          (brandProfile?.accountCategory ===
            "network" ||
            matrixMetrics?.ok) && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() =>
                  navigate(NETWORK_DASHBOARD_ROUTE)
                }
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
              >
                Open Network Dashboard
              </button>
            </div>
          )}
      </div>
    </main>
  );
}

// ============================================================================
// ORDER CARD
// ============================================================================

function OrderCardDetails({ order }) {
  const orderId =
    order?._id ||
    order?.id ||
    "N/A";

  const status =
    order?.status ||
    order?.orderStatus ||
    "Pending";

  const total =
    Number(
      order?.totalAmount ??
        order?.total ??
        order?.amount ??
        0
    ) || 0;

  const createdAt =
    order?.createdAt ||
    order?.date ||
    null;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
            Order
          </p>

          <h3 className="mt-1 font-mono text-sm font-bold text-slate-800">
            #{String(orderId).slice(-10)}
          </h3>
        </div>

        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase text-emerald-700">
          {status}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
            Total
          </p>

          <p className="mt-1 text-sm font-black text-slate-900">
            KSh {total.toLocaleString()}
          </p>
        </div>

        <div>
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
            Date
          </p>

          <p className="mt-1 text-xs font-semibold text-slate-600">
            {createdAt
              ? new Date(
                  createdAt
                ).toLocaleDateString()
              : "N/A"}
          </p>
        </div>
      </div>

      {order?.items && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
            Items
          </p>

          <p className="mt-1 text-xs text-slate-600">
            {Array.isArray(order.items)
              ? `${order.items.length} item${
                  order.items.length === 1
                    ? ""
                    : "s"
                }`
              : "Order items available"}
          </p>
        </div>
      )}
    </article>
  );
}

