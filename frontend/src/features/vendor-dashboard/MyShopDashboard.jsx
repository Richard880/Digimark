
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../auth/hooks/useAuth";
import { uploadImageToCloudinary } from "../../utils/cloudinaryUploader";
import AddProductModal from "./AddProductModal";
import styles from "./MyShopDashboard.module.css";

const API_URL = import.meta.env.PROD
  ? ""
  : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

export default function MyShopDashboard() {
  const navigate = useNavigate();
  const { auth } = useAuth();

  const [activeTab, setActiveTab] = useState("inventory");
  const [allProducts, setAllProducts] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pinInputs, setPinInputs] = useState({});

  useEffect(() => {
    const fetchShopData = async () => {
      try {
        setIsLoading(true);

        const token = await auth?.currentUser?.getIdToken();

        const resolvedSellerId =
          auth?.user?.id ||
          auth?.user?._id ||
          auth?.profile?.id ||
          auth?.profile?._id ||
          auth?.currentUser?.uid;

        if (!resolvedSellerId) {
          setIsLoading(false);
          return;
        }

        // 1. Fetch Inventory
        const prodRes = await fetch(
          `${API_URL}/api/products?sellerId=${resolvedSellerId}&status=all`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (prodRes.ok) {
          const prodData = await prodRes.json();
          const inventoryArray = prodData?.feed || prodData || [];

          setAllProducts(
            Array.isArray(inventoryArray) ? inventoryArray : []
          );
        }

        // 2. Fetch Orders
        const orderRes = await fetch(`${API_URL}/api/orders`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (orderRes.ok) {
          const orderData = await orderRes.json();
          const ordersArray =
            orderData?.orders ||
            orderData?.feed ||
            orderData ||
            [];

          setSalesOrders(Array.isArray(ordersArray) ? ordersArray : []);
        }
      } catch (err) {
        console.error(
          "Dashboard backend hydration exception:",
          err
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (auth?.currentUser) {
      fetchShopData();
    } else {
      setIsLoading(false);
    }
  }, [auth, activeTab]);

  const handleToggleShelfPlacement = async (productId) => {
    try {
      const token = await auth?.currentUser?.getIdToken();

      const response = await fetch(
        `${API_URL}/api/products/${productId}/toggle-shelf`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const responseData = await response.json();

        setAllProducts((prev) =>
          prev.map((product) =>
            product._id === productId
              ? responseData.product
              : product
          )
        );
      }
    } catch (err) {
      console.error(
        "Failed to alter shelf state layout:",
        err
      );
    }
  };

  const handleVerifyDeliveryPin = async (orderNumber) => {
    const code = pinInputs[orderNumber];

    if (!code || code.trim().length !== 6) {
      alert("Please type a valid 6-digit PIN code.");
      return;
    }

    try {
      const token = await auth?.currentUser?.getIdToken();

      const response = await fetch(
        `${API_URL}/api/orders/verify-release-pin`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            orderNumber,
            providedPin: code,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        alert(
          "🎉 Pin verification successful! Funds released to your available balance."
        );

        setSalesOrders((prev) =>
          prev.map((order) =>
            order.orderNumber === orderNumber
              ? {
                  ...order,
                  orderStatus: "DELIVERED",
                }
              : order
          )
        );

        setPinInputs((prev) => ({
          ...prev,
          [orderNumber]: "",
        }));
      } else {
        alert(
          data.reason ||
            "Invalid code value signature entered."
        );
      }
    } catch (err) {
      console.error(
        "Escrow key verification boundary exception:",
        err
      );
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans antialiased text-slate-600">
      {/* SIDEBAR PANEL NAVIGATION */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col fixed inset-y-0 left-0 z-40 shadow-xl border-r border-slate-800">
        <div className="p-6 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
            🚀 Soko
            <span className="text-emerald-400">Digi</span>
          </h1>

          <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
            PRO
          </span>
        </div>

        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <button
            type="button"
            onClick={() => setActiveTab("inventory")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
              activeTab === "inventory"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/10"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
            }`}
          >
            📦 Warehouse Inventory
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("orders")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
              activeTab === "orders"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/10"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
            }`}
          >
            📋 Sales Orders
          </button>

          <div className="pt-4 border-t border-slate-800/60 mt-4">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-xs font-bold transition duration-200 shadow-sm cursor-pointer"
            >
              ➕ List New Asset
            </button>
          </div>
        </nav>

        {/* MERCHANT ACCOUNT CARD FOOTER */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-emerald-400">
            {auth?.profile?.displayName?.charAt(0).toUpperCase() ||
              "M"}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate">
              {auth?.profile?.brandName || "Active Merchant"}
            </p>

            <p className="text-[10px] text-slate-500 truncate">
              {auth?.currentUser?.email}
            </p>
          </div>
        </div>
      </aside>

      {/* MAIN WORKSPACE CONTENT CONTAINER */}
      <main className="flex-1 pl-64 min-w-0">
      
{/* WHITE FLOATING ACTION HEADER BAR */}
<header className="h-16 bg-white border-b border-slate-200/80 px-8 flex items-center justify-between sticky top-0 z-30 shadow-xs">
  <div className="flex items-center gap-4">
    {/* HOME / BACK BUTTON */}
    <button
      type="button"
      onClick={() => navigate("/")}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-all duration-200 text-xs font-bold shadow-sm cursor-pointer"
      title="Back to Home"
    >
      <span className="text-base">⌂</span>
      <span>Home</span>
    </button>

    {/* HEADER BREADCRUMB */}
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
        Dashboard Workspace
      </span>

      <span className="text-slate-300">/</span>

      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
        {activeTab === "inventory"
          ? "Warehouse Stock"
          : "Escrow Sales Log"}
      </span>
    </div>
  </div>

  {/* SYSTEM STATUS */}
  <div className="text-xs text-slate-400 font-medium">
    System Status:{" "}
    <span className="text-emerald-500 font-bold inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
      Operational
    </span>
  </div>
</header>

        {/* ACTION WORKSPACE WRAPPER */}
     {/* SECTION A: WAREHOUSE INVENTORY */}
{activeTab === "inventory" && (
  <div className="bg-white rounded-2xl border border-slate-200/60 shadow-xs overflow-hidden">
    <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
      <div>
        <h2 className="text-base font-bold text-slate-800">
          Stock Registry
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Manage listed market catalog streams and shelf placements.
        </p>
      </div>

      <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200/40">
        Total Items: {allProducts?.length || 0}
      </span>
    </div>

    {!allProducts || allProducts.length === 0 ? (
      <div className="p-16 text-center">
        <p className="text-sm font-bold text-slate-700">
          Your stockroom is empty
        </p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
          Click 'List New Asset' to publish products directly to the MarketHub grid feed.
        </p>
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <th className="p-4 pl-6">Product Details</th>
              <th className="p-4">SKU / Code</th>
              <th className="p-4">Retail Price</th>
              <th className="p-4">Network Comm</th>
              {/* 🎯 Added far-right Actions column heading */}
              <th className="p-4 pr-6 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
            {allProducts.map((product, idx) => {
              const isUnlisted = product.status === "UNLISTED";
              const prodId = product._id || product.id;

              return (
                <tr
                  key={prodId || idx}
                  className={`transition ${isUnlisted ? "bg-slate-50/60 text-slate-400" : "hover:bg-slate-50/50"}`}
                >
                  <td className="p-4 pl-6">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${isUnlisted ? "text-slate-400 line-through" : "text-slate-900"}`}>
                        {product.name || "Unnamed Asset"}
                      </span>
                      {/* Status pill capsule indicator */}
                      {isUnlisted && (
                        <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md">
                          Unlisted
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="p-4 font-mono text-slate-500">
                    {product.productCode || product.sku || "N/A"}
                  </td>

                  <td className={`p-4 ${isUnlisted ? "text-slate-400" : "text-slate-700"}`}>
                    KES {Number(product.price || 0).toLocaleString()}
                  </td>

                  <td className={`p-4 ${isUnlisted ? "text-slate-400" : "text-emerald-600 font-bold"}`}>
                    KES {Number(product.affiliateCommission || 0).toLocaleString()}
                  </td>

                  {/* 🎯 Fixed: Interactive operational control layout block */}
                  <td className="p-4 pr-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* Button A: Visibility Toggle (List / Unlist) */}
                      <button
                        type="button"
                        onClick={() => handleToggleProductVisibility?.(prodId, product.status)}
                        className={`p-1.5 rounded-lg border transition cursor-pointer ${
                          isUnlisted
                            ? "bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100"
                            : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                        }`}
                        title={isUnlisted ? "Publish to public store shelves" : "Unlist from store shelves"}
                      >
                        {isUnlisted ? (
                          /* Slash eye icon for unlisted assets */
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                          </svg>
                        ) : (
                          /* Standard visible eye icon */
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>

                      {/* Button B: Edit / Update Product Profile */}
                      <button
                        type="button"
                        onClick={() => handleTriggerEditModal?.(product)}
                        className="p-1.5 bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 hover:text-slate-700 transition cursor-pointer"
                        title="Edit product parameters"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>

                      {/* Button C: Permanent Asset Purge (Delete) */}
                      <button
                        type="button"
                        onClick={() => handlePurgeProductAsset?.(prodId)}
                        className="p-1.5 bg-white border border-red-200 text-red-500 rounded-lg hover:bg-red-50 hover:text-red-600 transition cursor-pointer"
                        title="Delete product permanently"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-14v4M1 7h22" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </div>
)}
        
{/* SECTION B: SALES AND PIN ESCROW */}
              {activeTab === "orders" && (
                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-xs overflow-hidden">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h2 className="text-base font-bold text-slate-800">
                      Escrow Sales Ledgers
                    </h2>

                    <p className="text-xs text-slate-400 mt-0.5">
                      Input customer clearance confirmation keys
                      to unlock pending balances.
                    </p>
                  </div>

                  {!salesOrders || salesOrders.length === 0 ? (
                    <div className="p-16 text-center">
                      <p className="text-sm font-bold text-slate-700">
                        No transactions recorded
                      </p>

                      <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                        When promoters secure orders across the
                        social channels, matching entries deploy
                        right here.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            <th className="p-4 pl-6">Order ID</th>
                            <th className="p-4">Customer Base</th>
                            <th className="p-4">Escrow Value</th>
                            <th className="p-4">Status</th>
                            <th className="p-4 pr-6 text-right">
                              Clearance Verification Lock
                            </th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                          {salesOrders.map((order, idx) => (
                            <tr
                              key={
                                order._id ||
                                order.id ||
                                idx
                              }
                              className="hover:bg-slate-50/50 transition"
                            >
                              <td className="p-4 pl-6 font-mono text-slate-900 font-bold">
                                #{order.orderNumber || "0000"}
                              </td>

                              <td className="p-4">
                                <div className="font-semibold text-slate-800">
                                  {order.shippingDetails
                                    ?.fullName ||
                                    "Guest Account"}
                                </div>

                                <div className="text-[10px] text-slate-400 font-normal">
                                  {order.shippingDetails
                                    ?.phoneNumber ||
                                    "No Contact"}
                                </div>
                              </td>

                              <td className="p-4 font-bold text-slate-900">
                                KES{" "}
                                {Number(
                                  order.totalPrice || 0
                                ).toLocaleString()}
                              </td>

                              <td className="p-4">
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    order.orderStatus ===
                                    "DELIVERED"
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-100/40"
                                      : "bg-amber-50 text-amber-700 border border-amber-100/40"
                                  }`}
                                >
                                  {order.orderStatus ===
                                  "DELIVERED"
                                    ? "Released"
                                    : "In Escrow"}
                                </span>
                              </td>

                              <td className="p-4 pr-6 text-right">
                                {order.orderStatus ===
                                "DELIVERED" ? (
                                  <span className="text-emerald-600 font-bold inline-flex items-center gap-1">
                                    ✅ Payout Processed
                                  </span>
                                ) : (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      maxLength={6}
                                      placeholder="6-Digit PIN..."
                                      value={
                                        pinInputs[
                                          order.orderNumber
                                        ] || ""
                                      }
                                      onChange={(e) => {
                                        const value =
                                          e.target.value.replace(
                                            /\D/g,
                                            ""
                                          );

                                        setPinInputs((prev) => ({
                                          ...prev,
                                          [order.orderNumber]:
                                            value,
                                        }));
                                      }}
                                      className="w-28 text-center rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono font-bold tracking-widest focus:border-emerald-500 focus:outline-none"
                                    />

                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleVerifyDeliveryPin(
                                          order.orderNumber
                                        )
                                      }
                                      className="px-3 py-1.5 bg-slate-900 text-white hover:bg-slate-800 font-bold rounded-lg text-[10px] uppercase transition tracking-wider shadow-xs cursor-pointer"
                                    >
                                      Verify Key
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ADD PRODUCT MODAL */}
              <AddProductModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={(newProduct) => {
                  setAllProducts((prev) => [
                    newProduct,
                    ...prev,
                  ]);
                }}
                uploadImageToCloudinary={
                  uploadImageToCloudinary
                }
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

