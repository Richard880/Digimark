import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import useAuth from "../../auth/hooks/useAuth";
import MatrixTreeChart from "../../vendor-dashboard/MatrixTreeChart";
import LegDistributionCards from "../../vendor-dashboard/LegDistributionCards";

import AvatarMenuModal from "./AvatarMenuModal";
import { uploadImageToCloudinary } from "../../../utils/cloudinaryUploader";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000";

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

const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("products");
  const [shareMessage, setShareMessage] = useState("");

const [isAvatarModalOpen, setIsAvatarModalOpen] =
    useState(false);
  const [isUpdatingAvatar, setIsUpdatingAvatar] =
    useState(false);

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

console.log("Starting profile image upload...");

// This utility should return the Cloudinary secure URL.
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

setBrandProfile((previousProfile) => ({
        ...previousProfile,
        photoURL: uploadedUrl,
        profilePic: uploadedUrl,
      }));

const token = await currentUser.getIdToken();

const profileResponse = await fetch(
        `${API_URL}/api/auth/profile-update`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            profilePic: uploadedUrl,
            photoURL: uploadedUrl,
          }),
        }
      );

if (!profileResponse.ok) {
        const responseText =
          await profileResponse.text();

throw new Error(
          `Profile update failed: ${profileResponse.status} ${responseText}`
        );
      }

console.log(
        "Profile avatar changes synced successfully."
      );

setIsAvatarModalOpen(false);
    } catch (error) {
      console.error("Avatar synchronization error:", error);

if (error?.name === "AbortError") {
        alert(
          "The image upload was aborted. Please try again with a smaller image."
        );
      } else {
        alert(
          error?.message ||
            "Unable to update the profile picture."
        );
      }
    } finally {
      setIsUpdatingAvatar(false);
      event.target.value = "";
    }
  };

useEffect(() => {
    let isMounted = true;

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

const loadProfile = async () => {
      try {
        setIsLoading(true);

let resolvedProfile = null;
        let resolvedMatrixMetrics = null;

/*
         * Own profile
         */
        if (isOwnProfile && loggedInUser) {
          resolvedProfile = {
            id:
              loggedInProfile?.id ||
              loggedInProfile?._id ||
              auth?.user?.id ||
              auth?.user?._id ||
              loggedInUser?.uid,

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
              loggedInProfile?.accountCategory ||
              auth?.user?.accountCategory ||
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

bio:
              loggedInProfile?.bio ||
              loggedInProfile?.description ||
              "",

photoURL:
              loggedInProfile?.photoURL ||
              loggedInProfile?.photoUrl ||
              loggedInProfile?.profilePhoto ||
              loggedInProfile?.profilePic ||
              loggedInProfile?.avatar ||
              loggedInUser?.photoURL ||
              "",

networkLevel:
              loggedInProfile?.networkLevel ||
              loggedInProfile?.marketerLevel ||
              loggedInProfile?.level ||
              auth?.user?.networkLevel ||
              auth?.user?.marketerLevel ||
              auth?.user?.level ||
              null,

subscribers:
              loggedInProfile?.subscriberCount ||
              loggedInProfile?.subscribers ||
              0,

subscriptions:
              loggedInProfile?.subscriptionCount ||
              loggedInProfile?.subscriptions ||
              0,
          };

if (auth?.matrixMetrics?.ok) {
            resolvedMatrixMetrics = auth.matrixMetrics;
          }
        } else {
          /*
           * Public profile
           */
          const profileResponse = await fetch(
            `${API_URL}/api/products/market`
          );

if (profileResponse.ok) {
            const feedData = await profileResponse.json();

const feedList = Array.isArray(feedData)
              ? feedData
              : Array.isArray(feedData?.products)
              ? feedData.products
              : [];

const matchedItem = feedList.find(
              (product) =>
                product?.shopId === activeTargetId ||
                product?.userId === activeTargetId ||
                product?.ownerId === activeTargetId
            );

if (matchedItem) {
              resolvedProfile = {
                id: activeTargetId,

name:
                  matchedItem?.displayName ||
                  matchedItem?.sellerName ||
                  matchedItem?.name ||
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
                  matchedItem?.brandName ||
                  "",

phoneNumber:
                  matchedItem?.phoneNumber ||
                  "",

bio:
                  matchedItem?.bio ||
                  matchedItem?.description ||
                  "",

photoURL:
                  matchedItem?.photoURL ||
                  matchedItem?.photoUrl ||
                  matchedItem?.profilePhoto ||
                  matchedItem?.profilePic ||
                  matchedItem?.avatar ||
                  "",

networkLevel:
                  matchedItem?.networkLevel ||
                  matchedItem?.marketerLevel ||
                  matchedItem?.level ||
                  null,

subscribers:
                  matchedItem?.subscriberCount ||
                  matchedItem?.subscribers ||
                  0,

subscriptions:
                  matchedItem?.subscriptionCount ||
                  matchedItem?.subscriptions ||
                  0,
              };
            }
          }

if (!resolvedProfile) {
            resolvedProfile = {
              id: activeTargetId,
              name: "Independent SokoDigi Merchant",
              username: "merchant",
              accountCategory: "retail",
              membershipNumber: "N/A",
              brandName: "",
              phoneNumber: "",
              bio: "",
              photoURL: "",
              networkLevel: null,
              subscribers: 0,
              subscriptions: 0,
            };
          }
        }

if (!isMounted) {
          return;
        }

setBrandProfile(resolvedProfile);

const token = loggedInUser
          ? await loggedInUser
              .getIdToken()
              .catch(() => null)
          : null;

const headers = token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {};

/*
         * Matrix metrics
         */
        if (
          !resolvedMatrixMetrics &&
          (isOwnProfile ||
            resolvedProfile?.accountCategory === "network")
        ) {
          const metricsResponse = await fetch(
            `${API_URL}/api/network/matrix-metrics`,
            {
              headers,
            }
          );

if (metricsResponse.ok) {
            const metricsData =
              await metricsResponse.json();

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
         * Products
         */
        const productsResponse = await fetch(
          `${API_URL}/api/products?shopId=${encodeURIComponent(
            activeTargetId
          )}`
        );

if (productsResponse.ok) {
          const productsData =
            await productsResponse.json();

const productList = Array.isArray(productsData)
            ? productsData
            : Array.isArray(productsData?.products)
            ? productsData.products
            : [];

if (isMounted) {
            setProducts(productList);
          }
        } else if (isMounted) {
          setProducts([]);
        }
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
    loggedInUser,
    loggedInProfile,
    auth,
  ]);

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

return Number.isFinite(numericLevel) && numericLevel > 0
      ? numericLevel
      : null;
  }, [brandProfile, matrixMetrics]);

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

const networkMembers =
    matrixMetrics?.summary?.totalDownline ??
    matrixMetrics?.summary?.totalMembers ??
    matrixMetrics?.totalDownline ??
    matrixMetrics?.totalMembers ??
    0;

const subscribers =
    Number(brandProfile?.subscribers) || 0;

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
        await navigator.clipboard.writeText(profileUrl);

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
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleAvatarFileChange}
        className="hidden"
      />

<AvatarMenuModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        currentImageUrl={
          brandProfile?.photoURL ||
          brandProfile?.profilePic ||
          ""
        }
        isOwnProfile={isOwnProfile}
        onUploadClick={() => fileInputRef.current?.click()}
      />

<div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 md:py-10">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="px-5 py-8 sm:px-8 md:px-10 md:py-10">
            <div className="flex flex-col gap-7 md:flex-row md:items-start md:gap-10">
              <div className="flex shrink-0 justify-center md:justify-start">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setIsAvatarModalOpen(true)
                    }
                    disabled={isUpdatingAvatar}
                    title={
                      isOwnProfile
                        ? "Manage Profile Photo"
                        : "View Photo"
                    }
                    className="group relative block cursor-pointer rounded-full border-0 bg-transparent p-0 focus:outline-none"
                  >
                    <div
                      className={`h-28 w-28 rounded-full border-[4px] bg-white p-1 shadow-sm transition duration-200 group-hover:border-emerald-500/40 sm:h-32 sm:w-32 md:h-36 md:w-36 ${levelInfo.ring}`}
                    >
                      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-emerald-50">
                        {brandProfile?.photoURL ||
                        brandProfile?.profilePic ? (
                          <img
                            src={
                              brandProfile?.photoURL ||
                              brandProfile?.profilePic
                            }
                            alt={
                              brandProfile?.name ||
                              "SokoDigi member"
                            }
                            className={`h-full w-full object-cover transition duration-200 ${
                              isUpdatingAvatar
                                ? "animate-pulse opacity-30"
                                : "group-hover:opacity-90"
                            }`}
                            onError={(event) => {
                              event.currentTarget.style.display =
                                "none";
                            }}
                          />
                        ) : (
                          <svg
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="h-14 w-14 text-emerald-700 sm:h-16 sm:w-16"
                            aria-hidden="true"
                          >
                            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                          </svg>
                        )}

{isOwnProfile &&
                          !isUpdatingAvatar && (
                            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/20 text-white opacity-0 transition duration-200 group-hover:opacity-100">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="20"
                                height="24"
                                fill="currentColor"
                                viewBox="0 0 16 16"
                                aria-hidden="true"
                              >
                                <path d="M10.5 8.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0" />
                                <path d="M2 4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.172a2 2 0 0 1-1.414-.586l-.828-.828A2 2 0 0 0 9.172 2H6.828a2 2 0 0 0-1.414.586l-.828.828A2 2 0 0 1 3.172 4zm.5 2a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1m9 2.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0" />
                              </svg>
                            </div>
                          )}
                      </div>
                    </div>
                  </button>

<div
                    className={`absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border px-3 py-1 text-[9px] font-extrabold tracking-wider shadow-sm ${levelInfo.badge}`}
                  >
                    <span
                      className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${levelInfo.dot}`}
                    />
                    {levelInfo.shortName}
                  </div>
                </div>
              </div>

<div className="min-w-0 flex-1">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                      <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                        {brandProfile?.username ||
                          "sokodigi_member"}
                      </h1>

{brandProfile?.accountCategory ===
                        "network" && (
                        <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                          Network
                        </span>
                      )}
                    </div>

<p className="mt-1 text-sm text-slate-400">
                      SokoDigi member profile
                    </p>
                  </div>

{isOwnProfile ? (
                    <div className="flex flex-wrap justify-center gap-2 sm:justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(MEMBER_SETTINGS_ROUTE)
                        }
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                      >
                        Edit Profile
                      </button>

<button
                        type="button"
                        onClick={handleShareProfile}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                      >
                        Share
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap justify-center gap-2 sm:justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          setIsSubscribed(
                            (previous) => !previous
                          )
                        }
                        className={`rounded-lg px-6 py-2 text-xs font-bold transition ${
                          isSubscribed
                            ? "border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200"
                            : "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                        }`}
                      >
                        {isSubscribed
                          ? "✓ Subscribed"
                          : "+ Subscribe"}
                      </button>

<button
                        type="button"
                        onClick={handleShareProfile}
                        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                      >
                        Share
                      </button>
                    </div>
                  )}
                </div>

<div className="mt-5 text-center sm:text-left">
                  <h2 className="text-lg font-bold text-slate-900">
                    {brandProfile?.name ||
                      "SokoDigi Member"}
                  </h2>

<div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <span
                      className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${levelInfo.badge}`}
                    >
                      {levelInfo.name}
                    </span>

{brandProfile?.brandName && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold text-slate-500">
                        {brandProfile.brandName}
                      </span>
                    )}
                  </div>
                </div>

<p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-6 text-slate-500 sm:mx-0 sm:text-left">
                  {brandProfile?.bio ||
                    (brandProfile?.accountCategory ===
                    "network"
                      ? "SokoDigi network marketer and marketplace member."
                      : "SokoDigi marketplace merchant.")}
                </p>

<div className="mt-3 text-center sm:text-left">
                  {brandProfile?.membershipNumber && (
                    <span className="font-mono text-[10px] text-slate-400">
                      Member #
                      {brandProfile.membershipNumber}
                    </span>
                  )}
                </div>

<div className="mt-7 grid grid-cols-3 divide-x divide-slate-100 border-y border-slate-100 py-5">
                  <div className="text-center">
                    <p className="text-xl font-bold text-slate-900">
                      {products.length}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Listings
                    </p>
                  </div>

<div className="text-center">
                    <p className="text-xl font-bold text-slate-900">
                      {Number(networkMembers).toLocaleString()}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Network
                    </p>
                  </div>

<div className="text-center">
                    <p className="text-xl font-bold text-slate-900">
                      {Number(subscribers).toLocaleString()}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Subscribers
                    </p>
                  </div>
                </div>

{isOwnProfile &&
                  brandProfile?.accountCategory ===
                    "network" && (
                    <div className="mt-5 flex justify-center sm:justify-start">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            NETWORK_DASHBOARD_ROUTE
                          )
                        }
                        className="rounded-lg bg-slate-900 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800"
                      >
                        View Network Dashboard →
                      </button>
                    </div>
                  )}

{shareMessage && (
                  <p className="mt-3 text-center text-xs font-semibold text-emerald-600 sm:text-left">
                    ✓ {shareMessage}
                  </p>
                )}
              </div>
            </div>
          </div>

<div className="border-t border-slate-100 px-5 sm:px-8">
            <div className="flex items-center justify-center gap-8 sm:justify-start">
              <button
                type="button"
                onClick={() => setActiveTab("products")}
                className={`relative py-4 text-[11px] font-bold uppercase tracking-wider transition ${
                  activeTab === "products"
                    ? "text-emerald-700"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                Products

{activeTab === "products" && (
                  <span className="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-emerald-600" />
                )}
              </button>

<button
                type="button"
                onClick={() => setActiveTab("about")}
                className={`relative py-4 text-[11px] font-bold uppercase tracking-wider transition ${
                  activeTab === "about"
                    ? "text-emerald-700"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                About

{activeTab === "about" && (
                  <span className="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-emerald-600" />
                )}
              </button>
            </div>
          </div>
        </section>

{activeTab === "products" && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                  Storefront
                </h2>

<p className="mt-1 text-xs text-slate-400">
                  Products displayed by this member
                </p>
              </div>

<span className="rounded-full bg-slate-50 px-3 py-1 text-[10px] font-bold text-slate-500">
                {products.length}{" "}
                {products.length === 1 ? "item" : "items"}
              </span>
            </div>

{products.length === 0 ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    className="h-7 w-7 text-emerald-600"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 7h18M5 7l1 13h12l1-13M9 7V5a3 3 0 016 0v2"
                    />
                  </svg>
                </div>

<h3 className="mt-4 text-sm font-bold text-slate-800">
                  {isOwnProfile
                    ? "Your storefront is empty"
                    : "No products yet"}
                </h3>

<p className="mt-2 max-w-md text-xs leading-5 text-slate-500">
                  {isOwnProfile
                    ? "Add your first product and start displaying it to SokoDigi shoppers."
                    : "This member has not added products to their storefront yet."}
                </p>

{isOwnProfile && (
                  <button
                    type="button"
                    onClick={() => navigate("/marketplace")}
                    className="mt-5 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700"
                  >
                  >                     + Add Product
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
                {products.map((product) => {
                  const productId =
                    product?.id || product?._id;

const fullImageUrl =
                    getProductImageUrl(product);

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
                      className="group cursor-pointer overflow-hidden rounded-xl border border-slate-100 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
                    >
                      <div className="aspect-square overflow-hidden bg-slate-100">
                        {fullImageUrl ? (
                          <img
                            src={fullImageUrl}
                            alt={
                              product?.name ||
                              "SokoDigi product"
                            }
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            onError={(event) => {
                              event.currentTarget.style.display =
                                "none";
                            }}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <span className="text-xs text-slate-400">
                              No image
                            </span>
                          </div>
                        )}
                      </div>

<div className="p-4">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                          {product?.category || "General"}
                        </span>

<h3 className="mt-1.5 line-clamp-2 text-sm font-semibold text-slate-800">
                          {product?.name || "Untitled Product"}
                        </h3>

<div className="mt-4 flex items-end justify-between">
                          <div>
                            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                              Price
                            </p>

<p className="mt-0.5 text-sm font-bold text-slate-900">
                              KSh{" "}
                              {Number(
                                product?.price || 0
                              ).toLocaleString()}
                            </p>
                          </div>

<span className="text-xs text-slate-300 transition group-hover:text-emerald-600">
                            →
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

{activeTab === "about" && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 border-b border-slate-100 pb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                About
              </h2>

<p className="mt-1 text-xs text-slate-400">
                Member information
              </p>
            </div>

<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Account Type
                </p>

<p className="mt-2 text-sm font-semibold capitalize text-slate-800">
                  {brandProfile?.accountCategory || "Member"}
                </p>
              </div>

<div className="rounded-xl bg-slate-50 p-4">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Network Level
                </p>

<p className="mt-2 text-sm font-semibold text-slate-800">
                  {levelInfo.name}
                </p>
              </div>

<div className="rounded-xl bg-slate-50 p-4">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Membership Number
                </p>

<p className="mt-2 font-mono text-sm font-semibold text-slate-800">
                  {brandProfile?.membershipNumber || "N/A"}
                </p>
              </div>

<div className="rounded-xl bg-slate-50 p-4">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Network Members
                </p>

<p className="mt-2 text-sm font-semibold text-slate-800">
                  {Number(networkMembers).toLocaleString()}
                </p>
              </div>

<div className="rounded-xl bg-slate-50 p-4">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Subscribers
                </p>

<p className="mt-2 text-sm font-semibold text-slate-800">
                  {Number(subscribers).toLocaleString()}
                </p>
              </div>

<div className="rounded-xl bg-slate-50 p-4">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Store / Brand
                </p>

<p className="mt-2 text-sm font-semibold text-slate-800">
                  {brandProfile?.brandName ||
                    "SokoDigi Merchant"}
                </p>
              </div>
            </div>
          </section>
        )}

{isOwnProfile && matrixMetrics?.ok && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex flex-col gap-2 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                  Network Overview
                </h2>

<p className="mt-1 text-xs text-slate-400">
                  Your private network analytics
                </p>
              </div>

<button
                type="button"
                onClick={() =>
                  navigate(NETWORK_DASHBOARD_ROUTE)
                }
                className="self-start rounded-lg border border-slate-200 bg-white px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 transition hover:bg-slate-50"
              >
                Full Dashboard →
              </button>
            </div>

<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
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
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
