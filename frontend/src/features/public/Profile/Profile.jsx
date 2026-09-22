import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import useAuth from "../../auth/hooks/useAuth";
import MatrixTreeChart from "../../vendor-dashboard/MatrixTreeChart";
import LegDistributionCards from "../../vendor-dashboard/LegDistributionCards";

import AvatarMenuModal from "./AvatarMenuModal";
import { uploadImageToCloudinary } from "../../../utils/cloudinaryUploader";

// Use relative API routes in production, with localhost fallback in development.
const API_URL = import.meta.env.PROD
  ? ""
  : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

const MEMBER_SETTINGS_ROUTE = "/settings";
const NETWORK_DASHBOARD_ROUTE = "/dashboard/network";

export default function Profile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { auth } = useAuth();

  const fileInputRef = useRef(null);

  const loggedInUser = auth?.currentUser;
  const loggedInProfile = auth?.profile || {};

  const isOwnProfile =
    !userId ||
    userId === loggedInUser?.uid ||
    userId === loggedInProfile?.id ||
    userId === loggedInProfile?._id ||
    userId === auth?.user?.id ||
    userId === auth?.user?._id;

  const [brandProfile, setBrandProfile] = useState(null);
  const [matrixMetrics, setMatrixMetrics] = useState(null);
  const [products, setProducts] = useState([]);
  
  // Declare sharedProducts state
  const [sharedProducts, setSharedProducts] = useState([]);

  const [myOrdersList, setMyOrdersList] = useState([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("products");
  const [shareMessage, setShareMessage] = useState("");

  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);

  // Fetch orders when activeTab is 'orders'
  useEffect(() => {
    if (activeTab === "orders") {
      fetchOrders();
    }
  }, [activeTab]);

  const fetchOrders = async () => {
    try {
      const response = await fetch(`${API_URL}/api/orders`);
      if (response.ok) {
        const data = await response.json();
        setMyOrdersList(data);
      } else {
        setMyOrdersList([]);
        console.error("Failed to fetch orders:", response.status);
      }
    } catch (err) {
      console.error("Error fetching orders:", err);
      setMyOrdersList([]);
    }
  };

  // Fetch shared products when 'shared' tab is active
  const fetchSharedProducts = async () => {
    try {
      const response = await fetch(`${API_URL}/api/shared-products`, {
        headers: {
          Authorization: `Bearer ${auth?.currentUser?.accessToken}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setSharedProducts(data);
      } else if (response.status === 401) {
        console.error("Unauthorized: Please log in again.");
        // Handle logout or re-authentication if necessary
      } else {
        console.error("Failed to load shared products:", response.status);
      }
    } catch (error) {
      console.error("Error fetching shared products:", error);
    }
  };

  // Call fetchSharedProducts when 'shared' tab is active
useEffect(() => {
  let isMounted = true;

  const fetchProfileData = async () => {
    try {
      setIsLoading(true); // Start loading state indicator
      
      const response = await fetch(`${API_URL}/api/profiles/${activeTargetId}`);
      if (response.ok) {
        const data = await response.json();
        if (isMounted) setBrandProfile(data);
      } else {
        console.warn("Profile structure not found on server:", response.status);
      }
    } catch (error) {
      console.error("Failed to load user profile dataset:", error);
    } finally {
      // 🟢 CRITICAL: This MUST run no matter what to unfreeze the blank screen
      if (isMounted) {
        setIsLoading(false); 
      }
    }
  };

  if (activeTargetId) {
    fetchProfileData();
  }

  return () => {
    isMounted = false;
  };
}, [activeTargetId]);


  const handleAvatarFileChange = async (event) => {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) return;

    if (!selectedFile.type.startsWith("image/")) {
      alert("Please select a valid image file.");
      event.target.value = "";
      return;
    }

    if (selectedFile.size > 2 * 1024 * 1024) {
      alert("Profile picture files are restricted to a maximum size of 2MB.");
      event.target.value = "";
      return;
    }

    setIsUpdatingAvatar(true);

    try {
      const currentUser = auth?.currentUser;

      if (!currentUser) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      console.log("Starting profile image upload to Cloudinary...");

      const uploadedUrl = await uploadImageToCloudinary(selectedFile, "profiles");

      if (typeof uploadedUrl !== "string" || uploadedUrl.trim() === "") {
        throw new Error("Upload pipeline failed to resolve an image URL.");
      }

      setBrandProfile((previousProfile) => ({
        ...previousProfile,
        photoURL: uploadedUrl,
        profilePic: uploadedUrl,
        profilePhoto: uploadedUrl,
      }));

      const token = await currentUser.getIdToken();

      const profileResponse = await fetch(`${API_URL}/api/auth/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          profilePic: uploadedUrl,
          photoURL: uploadedUrl,
          userData: {
            profilePic: uploadedUrl,
            photoURL: uploadedUrl,
          },
        }),
      });

      if (!profileResponse.ok) {
        const responseText = await profileResponse.text();
        throw new Error(`Profile sync failed: ${profileResponse.status} ${responseText}`);
      }

      console.log("Profile avatar changes synced successfully.");
      setIsAvatarModalOpen(false);

      window.dispatchEvent(
        new CustomEvent("profile-avatar-updated", {
          detail: {
            profilePic: uploadedUrl,
            photoURL: uploadedUrl,
          },
        })
      );
    } catch (error) {
      console.error("Avatar synchronization error:", error);
      alert(error?.message || "Unable to update the profile picture.");
    } finally {
      setIsUpdatingAvatar(false);
      event.target.value = "";
    }
  };

  // Load profile and related data
  useEffect(() => {
    let isMounted = true;

    const activeTargetId =
      isOwnProfile
        ? loggedInProfile?.id ||
          loggedInProfile?._id ||
          auth?.user?.id ||
          auth?.user?._id ||
          loggedInUser?.uid
        : userId;

    if (!activeTargetId) {
      setIsLoading(false);
      setProducts([]);
      return undefined;
    }

    const loadProfile = async () => {
      try {
        setIsLoading(true);

        let resolvedProfile = null;
        let resolvedMatrixMetrics = null;

        if (isOwnProfile && loggedInUser) {
          const accountCategory =
            loggedInProfile?.accountCategory ||
            auth?.user?.accountCategory ||
            "retail";

          resolvedProfile = {
            id:
              loggedInProfile?.id ||
              loggedInProfile?._id ||
              auth?.user?.id ||
              auth?.user?._id ||
              loggedInUser?.uid,
            name:
              `${loggedInProfile?.firstName || ""} ${loggedInProfile?.lastName || ""}`.trim() ||
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
            brandName: loggedInProfile?.brandName || "SokoDigi Merchant",
            phoneNumber:
              loggedInProfile?.phoneNumber ||
              loggedInUser?.phoneNumber ||
              "",
            bio: loggedInProfile?.bio || loggedInProfile?.description || "",
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
            subscribers: loggedInProfile?.subscriberCount || 0,
            subscriptions: loggedInProfile?.subscriptionCount || 0,
          };

          if (accountCategory === "network") {
            try {
              const token = await loggedInUser.getIdToken();

              const metricsResponse = await fetch(`${API_URL}/api/network/matrix-metrics`, {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });

              if (metricsResponse.ok) {
                resolvedMatrixMetrics = await metricsResponse.json();
              }
            } catch (metricsError) {
              console.error("Delayed matrix aggregation lookup error:", metricsError);
              resolvedMatrixMetrics = null;
            }
          }
        } else {
          const profileResponse = await fetch(`${API_URL}/api/products/market`);

          if (profileResponse.ok) {
            const feedData = await profileResponse.json();
            const feedList = Array.isArray(feedData)
              ? feedData
              : feedData?.products || [];

            const matchedItem = feedList.find(
              (product) =>
                product?.shopId === activeTargetId || product?.userId === activeTargetId
            );

            if (matchedItem) {
              resolvedProfile = {
                id: activeTargetId,
                name:
                  matchedItem?.displayName ||
                  matchedItem?.sellerName ||
                  "SokoDigi Merchant",
                username: matchedItem?.username || "merchant",
                accountCategory: matchedItem?.accountCategory || "retail",
                membershipNumber: matchedItem?.membershipNumber || "N/A",
                brandName: matchedItem?.brandName || "",
                phoneNumber: matchedItem?.phoneNumber || "",
                bio: matchedItem?.bio || "",
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
                networkLevel: matchedItem?.networkLevel || null,
                subscribers: matchedItem?.subscriberCount || 0,
                subscriptions: matchedItem?.subscriptionCount || 0,
              };
            }
          }
        }

        const productsResponse = await fetch(
          `${API_URL}/api/products?shopId=${encodeURIComponent(activeTargetId)}`
        );

        let resolvedProducts = [];

        if (productsResponse.ok) {
          const productsData = await productsResponse.json();

          resolvedProducts = Array.isArray(productsData)
            ? productsData
            : Array.isArray(productsData?.products)
            ? productsData.products
            : [];
        }

        if (!isMounted) return;

        setBrandProfile(resolvedProfile);
        setMatrixMetrics(resolvedMatrixMetrics);
        setProducts(resolvedProducts);
      } catch (error) {
        console.error("SokoDigi profile loading error:", error);

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
  }, [userId, isOwnProfile, loggedInUser, loggedInProfile, auth?.user]);

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
      (value) => value !== null && value !== undefined && value !== ""
    );

    const numericLevel = Number(foundLevel);

    return Number.isFinite(numericLevel) && numericLevel > 0 ? numericLevel : null;
  }, [brandProfile, matrixMetrics]);

  const levelInfo = useMemo(() => {
    if (!networkLevel) {
      return {
        name: "Member",
        shortName: "MEMBER",
        ring: "border-slate-300",
        badge: "bg-slate-100 text-slate-600 border-slate-200",
        dot: "bg-slate-400",
      };
    }

    if (networkLevel >= 4) {
      return {
        name: "Level 4 Network",
        shortName: "LEVEL 4",
        ring: "border-amber-400",
        badge: "bg-amber-50 text-amber-700 border-amber-200",
        dot: "bg-amber-500",
      };
    }

    if (networkLevel === 3) {
      return {
        name: "Level 3 Network",
        shortName: "LEVEL 3",
        ring: "border-purple-500",
        badge: "bg-purple-50 text-purple-700 border-purple-200",
        dot: "bg-purple-500",
      };
    }

    if (networkLevel === 2) {
      return {
        name: "Level 2 Network",
        shortName: "LEVEL 2",
        ring: "border-blue-500",
        badge: "bg-blue-50 text-blue-700 border-blue-200",
        dot: "bg-blue-500",
      };
    }

    return {
      name: "Level 1 Network",
      shortName: "LEVEL 1",
      ring: "border-emerald-500",
      badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dot: "bg-emerald-500",
    };
  }, [networkLevel]);

  const networkMembers =
    matrixMetrics?.summary?.totalDownline ??
    matrixMetrics?.summary?.totalMembers ??
    matrixMetrics?.totalDownline ??
    matrixMetrics?.totalMembers ??
    0;

  const subscribers = Number(brandProfile?.subscribers) || 0;

  const handleShareProfile = async () => {
    try {
      const profileUrl = window.location.href;

      if (navigator.share) {
        await navigator.share({
          title: `${brandProfile?.name || "SokoDigi Member"} | SokoDigi`,
          text: `View ${brandProfile?.name || "this member"} on SokoDigi.`,
          url: profileUrl,
        });

        return;
      }

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(profileUrl);

        setShareMessage("Profile link copied");

        window.setTimeout(() => {
          setShareMessage("");
        }, 2500);
      }
    } catch (error) {
      console.warn("Profile sharing cancelled or unavailable:", error);
    }
  };

  const getProductImageUrl = (product) => {
    const imageUrl = product?.imageUrl || product?.image || product?.thumbnail || "";

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

  return (
    <main className="min-h-screen bg-slate-50/60">
      {/* Avatar upload input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleAvatarFileChange}
        className="hidden"
      />

      {/* Avatar modal */}
      <AvatarMenuModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        currentImageUrl={brandProfile?.photoURL || brandProfile?.profilePic || ""}
        isOwnProfile={isOwnProfile}
        onUploadClick={() => fileInputRef.current?.click()}
      />

      {/* Profile content */}
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 md:py-10">
        {/* Profile header, avatar, and info */}
        {/* ... (your existing JSX for profile header remains unchanged) ... */}

        {/* Tabs */}
        {/* ... (your existing JSX for tabs remains unchanged) ... */}

        {/* Content based on active tab */}
        {/* ... (your existing JSX for products, shared store, orders, about) ... */}

        {/* Shared Store tab */}
        {activeTab === "shared" && (
          <section className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {sharedProducts.length > 0 ? (
              sharedProducts.map((item) => (
                <div
                  key={item._id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  {/* Note: item.productId nested properties are populated directly by Mongoose! */}
                  <img
                    src={item.productId?.imageUrl}
                    alt={item.productId?.name}
                    className="h-40 w-full rounded-lg object-cover"
                    crossOrigin="anonymous"
                  />
                  <h3 className="mt-2 text-sm font-bold text-slate-800">{item.productId?.name}</h3>
                  <p className="text-xs text-slate-400 font-medium">By {item.productId?.brandName || "Partner Shop"}</p>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-50 pt-2">
                    <span className="text-sm font-black text-slate-900">KES {item.productId?.price?.toLocaleString()}</span>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-extrabold text-amber-700 uppercase">
                      Affiliate Pick
                    </span>
                  </div>

                  {item.customNotes && (
                    <p className="mt-2 bg-slate-50 p-2 rounded text-[11px] italic text-slate-500">
                      💡 "{item.customNotes}"
                    </p>
                  )}
                </div>
              ))
            ) : (
              <div className="col-span-full text-center py-12 text-slate-400 text-xs">
                No re-pinned catalog products listed on this storefront yet.
              </div>
            )}
          </section>
        )}

        {/* My Orders tab */}
        {activeTab === "orders" && (
          <section className="mt-6 space-y-4">
            <h3 className="text-base font-bold text-slate-800">My Purchase Receipts</h3>
            <p className="text-xs text-slate-400 -mt-2 mb-4">
              View your product delivery slips, active packages, and secure escrow verification codes.
            </p>

            {/* OrderCardDetails component should be defined elsewhere */}
            <div className="grid gap-6 md:grid-cols-2">
              {myOrdersList.length > 0 ? (
                myOrdersList.map((order) => (
                  <OrderCardDetails key={order._id} order={order} />
                ))
              ) : (
                <div className="col-span-full text-center py-12 text-slate-400 text-xs bg-white rounded-2xl border border-slate-100">
                  You haven't purchased any items from the MarketHub yet.
                </div>
              )}
            </div>
          </section>
        )}

        {/* About tab */}
        {activeTab === "about" && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            {/* ... (your existing about content) ... */}
          </section>
        )}
      </div>
    </main>
  );
}

// Helper function for product image URL
const getProductImageUrl = (product) => {
  const imageUrl = product?.imageUrl || product?.image || product?.thumbnail || "";

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
