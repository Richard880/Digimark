import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../auth/hooks/useAuth";
import { uploadImageToCloudinary } from "../../utils/cloudinaryUploader";
import AddProductModal from "./AddProductModal";
import "./MyShopDashboard.css";

const API_URL = import.meta.env.PROD
  ? "" // Relative path in production
  : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");


const initialEditForm = {
  name: "",
  price: "",
  affiliateCommission: "",
  quantity: "",
  deliveryFee: "",
  category: "",
  description: "",
  imageUrl: "",
};

export default function MyShopDashboard() {
  const navigate = useNavigate();
  const { auth } = useAuth();

  const [activeTab, setActiveTab] = useState("inventory");
  const [allProducts, setAllProducts] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pinInputs, setPinInputs] = useState({});
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [editForm, setEditForm] = useState(initialEditForm);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [busyProductId, setBusyProductId] = useState(null);
  const [error, setError] = useState(null);

  /**
   * Get Firebase ID token and construct auth headers
   * Used for all authenticated API calls to backend
   */
  const getAuthHeaders = useCallback(
    async (json = false) => {
      try {
        const token = await auth?.currentUser?.getIdToken();

        if (!token) {
          throw new Error("Your session has expired. Please sign in again.");
        }

        return {
          Authorization: `Bearer ${token}`,
          ...(json ? { "Content-Type": "application/json" } : {}),
        };
      } catch (err) {
        console.error("❌ Auth header error:", err);
        throw err;
      }
    },
    [auth?.currentUser]
  );

  /**
   * Parse API response and handle errors consistently
   */
  const readResponse = async (response) => {
    let data = {};
    try {
      data = await response.json();
    } catch {
      console.warn("⚠️ Response body is not valid JSON");
    }

    if (!response.ok) {
      const errorMsg =
        data.reason ||
        data.message ||
        data.error ||
        `Request failed with status ${response.status}`;
      throw new Error(errorMsg);
    }

    return data;
  };

  /**
   * FETCH SHOP DATA FROM BACKEND
   * 
   * Calls GET /api/products?status=all with Firebase auth token
   * Backend controller (listProducts) checks:
   * - If authenticated with Firebase token
   * - Returns products where sellerId matches req.user._id
   * - Includes both LISTED and UNLISTED products when status=all
   */
  const fetchShopData = useCallback(async () => {
    // Don't fetch if user is not authenticated
    if (!auth?.currentUser) {
      console.log("⚠️ No authenticated user, skipping product fetch");
      setAllProducts([]);
      setSalesOrders([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();

      console.log("📡 Fetching products from:", `${API_URL}/api/products?status=all`);

      // Fetch products with status=all to include both listed and unlisted
      const productsResponse = await fetch(
        `${API_URL}/api/products?status=all`,
        { headers }
      );

      const productsData = await readResponse(productsResponse);

      // ✅ Backend controller returns { ok: true, feed: [...], categoryContext, count }
      let products = [];
      if (Array.isArray(productsData)) {
        products = productsData;
      } else if (productsData?.feed && Array.isArray(productsData.feed)) {
        products = productsData.feed;
      } else if (productsData?.products && Array.isArray(productsData.products)) {
        products = productsData.products;
      } else if (productsData?.data && Array.isArray(productsData.data)) {
        products = productsData.data;
      }

      console.log(`✅ Loaded ${products.length} products from backend`);
      setAllProducts(products);

      // Try to fetch orders (optional endpoint, may not be implemented)
      try {
        const ordersResponse = await fetch(`${API_URL}/api/orders`, { headers });
        const ordersData = await readResponse(ordersResponse);

        let orders = [];
        if (Array.isArray(ordersData)) {
          orders = ordersData;
        } else if (ordersData?.orders && Array.isArray(ordersData.orders)) {
          orders = ordersData.orders;
        } else if (ordersData?.feed && Array.isArray(ordersData.feed)) {
          orders = ordersData.feed;
        }

        setSalesOrders(orders);
      } catch (orderError) {
        console.warn("⚠️ Orders endpoint not available:", orderError.message);
        setSalesOrders([]);
      }
    } catch (error) {
      console.error("❌ Failed to load shop dashboard:", error);
      setError(error.message || "Unable to load your shop data.");
      setAllProducts([]);
      setSalesOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, [auth?.currentUser, getAuthHeaders]);

  /**
   * Fetch shop data when auth state changes
   */
  useEffect(() => {
    fetchShopData();
  }, [fetchShopData]);

  /**
   * TOGGLE PRODUCT VISIBILITY
   * 
   * Calls PATCH /api/products/:id/status
   * Toggles between LISTED (visible) and UNLISTED (hidden)
   * Backend validates: auth required + sellerId must match + valid status
   */
  const handleToggleProductVisibility = async (product) => {
    const productId = product._id || product.id;

    if (!productId) {
      alert("This product has no valid ID.");
      return;
    }

    const previousStatus = product.status;
    const targetStatus = previousStatus === "UNLISTED" ? "LISTED" : "UNLISTED";

    setBusyProductId(productId);

    // Optimistically update UI
    setAllProducts((previous) =>
      previous.map((item) =>
        (item._id || item.id) === productId
          ? { ...item, status: targetStatus, isShelved: targetStatus === "LISTED" }
          : item
      )
    );

    try {
      const headers = await getAuthHeaders(true);

      console.log(
        `📡 Updating product ${productId} status to ${targetStatus}`
      );

      const response = await fetch(`${API_URL}/api/products/${productId}/status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: targetStatus }),
      });

      const data = await readResponse(response);

      // Update with server response
      if (data.product) {
        setAllProducts((previous) =>
          previous.map((item) =>
            (item._id || item.id) === productId ? data.product : item
          )
        );
        console.log(`✅ Product ${productId} status updated to ${targetStatus}`);
      }
    } catch (error) {
      console.error("❌ Failed to update product visibility:", error);

      // Restore previous state on error
      setAllProducts((previous) =>
        previous.map((item) =>
          (item._id || item.id) === productId
            ? { ...item, status: previousStatus }
            : item
        )
      );

      alert(error.message || "Could not update product visibility.");
    } finally {
      setBusyProductId(null);
    }
  };

  /**
   * DELETE PRODUCT
   * 
   * Calls DELETE /api/products/:id (routes to purgeProductAsset controller)
   * Backend validates: auth required + sellerId must match
   */
  const handleDeleteProduct = async (product) => {
    const productId = product._id || product.id;

    if (!productId) {
      alert("This product has no valid ID.");
      return;
    }

    const confirmed = window.confirm(
      `Permanently delete "${product.name || "this product"}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    const previousProducts = [...allProducts];
    setBusyProductId(productId);

    // Optimistically remove from UI
    setAllProducts((previous) =>
      previous.filter((item) => (item._id || item.id) !== productId)
    );

    try {
      const headers = await getAuthHeaders();

      console.log(`📡 Deleting product ${productId}`);

      const response = await fetch(`${API_URL}/api/products/${productId}`, {
        method: "DELETE",
        headers,
      });

      await readResponse(response);
      console.log(`✅ Product ${productId} deleted`);
      alert("Product deleted successfully.");
    } catch (error) {
      console.error("❌ Failed to delete product:", error);
      // Restore on error
      setAllProducts(previousProducts);
      alert(error.message || "Could not delete this product.");
    } finally {
      setBusyProductId(null);
    }
  };

  /**
   * OPEN EDIT MODAL
   * Populates form with current product data
   */
  const handleOpenEditModal = (product) => {
    setSelectedProduct(product);

    setEditForm({
      name: product.name || "",
      price: String(product.price ?? ""),
      affiliateCommission: String(product.affiliateCommission ?? ""),
      quantity: String(product.quantity ?? ""),
      deliveryFee: String(product.deliveryFee ?? ""),
      category: product.category || "",
      description: product.description || "",
      imageUrl: product.imageUrl || "",
    });
  };

  /**
   * HANDLE EDIT INPUT CHANGE
   */
  const handleEditInputChange = (event) => {
    const { name, value } = event.target;

    setEditForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  /**
   * SAVE PRODUCT EDIT
   * 
   * Calls PUT /api/products/:id (routes to updateProduct controller)
   * Backend validates: auth required + sellerId must match + all fields are valid
   */
  const handleSaveProductEdit = async (event) => {
    event.preventDefault();

    if (!selectedProduct) return;

    const productId = selectedProduct._id || selectedProduct.id;
    const price = Number(editForm.price);
    const commission = Number(editForm.affiliateCommission);
    const quantity = Number(editForm.quantity);
    const deliveryFee = Number(editForm.deliveryFee || 0);

    // Validation
    if (!editForm.name.trim()) {
      alert("Enter a product name.");
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      alert("Enter a valid retail price.");
      return;
    }

    if (!Number.isFinite(commission) || commission < 0 || commission >= price) {
      alert("The affiliate commission must be zero or more and less than the retail price.");
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
      alert("Enter a valid whole-number quantity.");
      return;
    }

    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
      alert("Enter a valid delivery fee.");
      return;
    }

    setIsSavingEdit(true);

    try {
      const headers = await getAuthHeaders(true);

      console.log(`📡 Updating product ${productId}`);

      const response = await fetch(`${API_URL}/api/products/${productId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          name: editForm.name.trim(),
          price,
          affiliateCommission: commission,
          quantity,
          deliveryFee,
          category: editForm.category.trim() || "general",
          description: editForm.description.trim(),
          imageUrl: editForm.imageUrl.trim(),
        }),
      });

      const data = await readResponse(response);
      const updatedProduct = data.product || data;

      setAllProducts((previous) =>
        previous.map((item) =>
          (item._id || item.id) === productId
            ? { ...item, ...updatedProduct }
            : item
        )
      );

      setSelectedProduct(null);
      console.log(`✅ Product ${productId} updated`);
      alert("Product updated successfully.");
    } catch (error) {
      console.error("❌ Failed to update product:", error);
      alert(error.message || "Could not update the product.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  /**
   * VERIFY DELIVERY PIN
   * 
   * Calls PATCH /api/orders/verify-release-pin
   * This endpoint may not be implemented yet
   */
  const handleVerifyDeliveryPin = async (orderNumber) => {
    const code = pinInputs[orderNumber] || "";

    if (!/^\d{6}$/.test(code)) {
      alert("Please enter a valid 6-digit PIN.");
      return;
    }

    try {
      const headers = await getAuthHeaders(true);

      const response = await fetch(
        `${API_URL}/api/orders/verify-release-pin`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            orderNumber,
            providedPin: code,
          }),
        }
      );

      const data = await readResponse(response);

      setSalesOrders((previous) =>
        previous.map((order) =>
          order.orderNumber === orderNumber
            ? { ...order, orderStatus: "DELIVERED" }
            : order
        )
      );

      setPinInputs((previous) => ({
        ...previous,
        [orderNumber]: "",
      }));

      alert(
        data.message ||
          "PIN verified successfully. Check your wallet for the updated balance."
      );
    } catch (error) {
      console.error("❌ Delivery PIN verification failed:", error);
      alert(error.message || "Could not verify the delivery PIN.");
    }
  };

  /**
   * HANDLE PIN INPUT CHANGE
   * Only accepts digits, max 6 characters
   */
  const handlePinInputChange = (orderNumber, value) => {
    setPinInputs((previous) => ({
      ...previous,
      [orderNumber]: value.replace(/\D/g, "").slice(0, 6),
    }));
  };

  /**
   * CHECK IF PRODUCT IS UNLISTED
   */
  const isUnlisted = (product) => product.status === "UNLISTED";

  /**
   * GET STOCK STATUS BADGE CLASS
   */
  const getStockStatusClass = (quantity) => {
    if (quantity > 10) return "stock-high";
    if (quantity > 0) return "stock-medium";
    return "stock-low";
  };

  return (
    <div className="shop-dashboard min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 font-sans antialiased text-slate-600">
      {/* ============================= SIDEBAR ============================= */}
      <aside className="sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 text-slate-300 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 p-6">
          <h1 className="flex items-center gap-2 text-lg font-black tracking-tight text-white">
            🚀 Soko<span className="text-emerald-400">Digi</span>
          </h1>

          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 shadow-lg shadow-emerald-500/20">
            PRO
          </span>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto p-4">
          <button
            type="button"
            onClick={() => setActiveTab("inventory")}
            className={`nav-btn w-full rounded-xl px-4 py-3 text-left text-xs font-bold transition duration-300 ${
              activeTab === "inventory"
                ? "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-600/50"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            📦 Warehouse Inventory
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("orders")}
            className={`nav-btn w-full rounded-xl px-4 py-3 text-left text-xs font-bold transition duration-300 ${
              activeTab === "orders"
                ? "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-600/50"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            📋 Sales Orders
          </button>

          <div className="mt-4 border-t border-slate-800/60 pt-4">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="add-btn w-full rounded-xl border border-emerald-500/40 bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-3 text-xs font-bold text-emerald-300 transition duration-300 hover:border-emerald-400 hover:bg-gradient-to-r hover:from-emerald-900 hover:to-emerald-800 hover:text-white"
            >
              ➕ List New Asset
            </button>
          </div>
        </nav>

        <div className="user-profile flex items-center gap-3 border-t border-slate-800 bg-slate-950/60 p-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/50 bg-gradient-to-br from-emerald-600 to-emerald-700 text-xs font-bold text-white shadow-lg">
            {auth?.profile?.displayName?.charAt(0)?.toUpperCase() || "M"}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-white">
              {auth?.profile?.brandName || "Active Merchant"}
            </p>
            <p className="truncate text-[10px] text-slate-500">
              {auth?.currentUser?.email || ""}
            </p>
          </div>
        </div>
      </aside>

      {/* ============================= MAIN CONTENT ============================= */}
      <main className="main-content min-h-screen pl-64">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 shadow-md md:px-8">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="home-btn inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition duration-300 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700"
              title="Back to Home"
            >
              <span className="text-base">⌂</span>
              Home
            </button>

            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Dashboard
              </span>
              <span className="text-slate-300">/</span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                {activeTab === "inventory" ? "Warehouse Stock" : "Sales Orders"}
              </span>
            </div>
          </div>

          <div className="hidden items-center gap-2 text-xs font-medium text-slate-400 md:flex">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            <span className="font-bold text-emerald-600">Operational</span>
          </div>
        </header>

        <div className="content-area mx-auto max-w-7xl space-y-6 p-4 md:p-8">
          {/* Error Banner */}
          {error && (
            <div className="error-banner rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              ⚠️ {error}
            </div>
          )}

          {/* Loading State */}
          {isLoading ? (
            <div className="loading-state flex flex-col items-center justify-center space-y-4 rounded-2xl border border-slate-200 bg-white py-32 shadow-sm">
              <div className="loader h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600"></div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Loading your shop...
              </p>
            </div>
          ) : (
            <>
              {/* ============================= INVENTORY TAB ============================= */}
              {activeTab === "inventory" && (
                <section className="inventory-section overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-md">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-100/50 p-6">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">
                        Stock Registry
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        Manage your products, prices, and store visibility.
                      </p>
                    </div>

                    <span className="item-count rounded-full border border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700 shadow-sm">
                      <span className="text-lg">{allProducts.length}</span> Items
                    </span>
                  </div>

                  {allProducts.length === 0 ? (
                    <div className="empty-state p-16 text-center">
                      <div className="mb-4 text-5xl">📦</div>
                      <p className="text-lg font-bold text-slate-700">
                        Your stockroom is empty
                      </p>
                      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
                        Start building your inventory by adding your first product. Click "List New Asset" to get started!
                      </p>
                    </div>
                  ) : (
                    <div className="table-wrapper overflow-x-auto">
                      <table className="products-table w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            <th className="p-4 pl-6">Product Details</th>
                            <th className="p-4">SKU / Code</th>
                            <th className="p-4">Retail Price</th>
                            <th className="p-4">Affiliate Commission</th>
                            <th className="p-4">Stock</th>
                            <th className="p-4 pr-6 text-right">Actions</th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100 text-sm">
                          {allProducts.map((product, index) => {
                            const productId = product._id || product.id;
                            const unlisted = isUnlisted(product);
                            const busy = busyProductId === productId;

                            return (
                              <tr
                                key={productId || index}
                                className={`product-row transition duration-200 ${
                                  unlisted
                                    ? "bg-amber-50/40 text-slate-400"
                                    : "bg-white hover:bg-slate-50/60"
                                }`}
                              >
                                <td className="p-4 pl-6">
                                  <div className="flex items-center gap-3">
                                    {product.imageUrl ? (
                                      <img
                                        src={product.imageUrl}
                                        alt={product.name}
                                        className="h-10 w-10 rounded-lg object-cover"
                                        onError={(e) => {
                                          e.target.style.display = "none";
                                        }}
                                      />
                                    ) : (
                                      <div className="h-10 w-10 rounded-lg border border-slate-300 bg-slate-200 flex items-center justify-center">
                                        📷
                                      </div>
                                    )}
                                    <div>
                                      <span
                                        className={`font-semibold ${
                                          unlisted
                                            ? "text-slate-400"
                                            : "text-slate-900"
                                        }`}
                                      >
                                        {product.name || "Unnamed Product"}
                                      </span>
                                      {product.category && (
                                        <div className="text-xs text-slate-400">
                                          {product.category}
                                        </div>
                                      )}
                                    </div>

                                    {unlisted && (
                                      <span className="ml-auto rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                                        Unlisted
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td className="p-4 font-mono text-xs font-semibold text-slate-600">
                                  {product.productCode || "N/A"}
                                </td>

                                <td className="p-4 font-bold text-slate-900">
                                  KES {Number(product.price || 0).toLocaleString()}
                                </td>

                                <td className="p-4 font-bold text-emerald-600">
                                  KES {Number(
                                    product.affiliateCommission || 0
                                  ).toLocaleString()}
                                </td>

                                <td className="p-4">
                                  <span
                                    className={`status-badge ${getStockStatusClass(
                                      product.quantity
                                    )}`}
                                  >
                                    {product.quantity || 0}
                                  </span>
                                </td>

                                <td className="p-4 pr-6">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() =>
                                        handleToggleProductVisibility(product)
                                      }
                                      className={`action-btn rounded-lg border p-2 transition duration-200 disabled:cursor-wait disabled:opacity-50 ${
                                        unlisted
                                          ? "border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200"
                                          : "border-slate-300 bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-600"
                                      }`}
                                      title={
                                        unlisted
                                          ? "Publish product"
                                          : "Unlist product"
                                      }
                                    >
                                      {unlisted ? "👁" : "◉"}
                                    </button>

                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => handleOpenEditModal(product)}
                                      className="action-btn rounded-lg border border-slate-300 bg-white p-2 text-slate-600 transition duration-200 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50"
                                      title="Edit product"
                                    >
                                      ✏️
                                    </button>

                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => handleDeleteProduct(product)}
                                      className="action-btn rounded-lg border border-red-300 bg-white p-2 text-red-600 transition duration-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                                      title="Delete product"
                                    >
                                      🗑
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
                </section>
              )}

              {/* ============================= SALES ORDERS TAB ============================= */}
              {activeTab === "orders" && (
                <section className="orders-section overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-md">
                  <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-100/50 p-6">
                    <h2 className="text-xl font-bold text-slate-900">
                      Sales Orders
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Verify customer delivery PINs for eligible orders.
                    </p>
                  </div>

                  {salesOrders.length === 0 ? (
                    <div className="empty-state p-16 text-center">
                      <div className="mb-4 text-5xl">📋</div>
                      <p className="text-lg font-bold text-slate-700">
                        No transactions recorded
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        Your orders will appear here when customers purchase from your store.
                      </p>
                    </div>
                  ) : (
                    <div className="table-wrapper overflow-x-auto">
                      <table className="orders-table w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            <th className="p-4 pl-6">Order ID</th>
                            <th className="p-4">Customer</th>
                            <th className="p-4">Order Value</th>
                            <th className="p-4">Status</th>
                            <th className="p-4 pr-6 text-right">Verification</th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                          {salesOrders.map((order, index) => {
                            const orderKey =
                              order.orderNumber || order._id || order.id || index;
                            const delivered = order.orderStatus === "DELIVERED";

                            return (
                              <tr key={orderKey} className="transition duration-200 hover:bg-slate-50/60">
                                <td className="p-4 pl-6 font-mono font-bold text-slate-900">
                                  #{order.orderNumber || order._id || "N/A"}
                                </td>

                                <td className="p-4">
                                  <div className="font-semibold text-slate-800">
                                    {order.shippingDetails?.fullName ||
                                      "Guest Account"}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {order.shippingDetails?.phoneNumber ||
                                      "No Contact"}
                                  </div>
                                </td>

                                <td className="p-4 font-bold text-slate-900">
                                  KES {Number(order.totalPrice || 0).toLocaleString()}
                                </td>

                                <td className="p-4">
                                  <span
                                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${
                                      delivered
                                        ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                                        : "border-amber-200 bg-amber-100 text-amber-800"
                                    }`}
                                  >
                                    {delivered ? "✓ Delivered" : order.orderStatus || "Pending"}
                                  </span>
                                </td>

                                <td className="p-4 pr-6 text-right">
                                  {delivered ? (
                                    <span className="font-bold text-emerald-600">
                                      ✓ Completed
                                    </span>
                                  ) : (
                                    <div className="flex items-center justify-end gap-2">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={6}
                                        placeholder="6-digit PIN"
                                        value={pinInputs[order.orderNumber] || ""}
                                        onChange={(event) =>
                                          handlePinInputChange(
                                            order.orderNumber,
                                            event.target.value
                                          )
                                        }
                                        className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-center font-mono text-xs font-bold tracking-widest outline-none transition focus:border-emerald-500 focus:shadow-md focus:shadow-emerald-200"
                                      />

                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleVerifyDeliveryPin(order.orderNumber)
                                        }
                                        className="verify-btn rounded-lg bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition duration-200 hover:from-slate-700 hover:to-slate-800"
                                      >
                                        Verify PIN
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </main>

      {/* ============================= ADD PRODUCT MODAL ============================= */}
      <AddProductModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={(newProduct) => {
          if (newProduct) {
            setAllProducts((previous) => [newProduct, ...previous]);
          } else {
            fetchShopData();
          }
          setIsModalOpen(false);
        }}
        uploadImageToCloudinary={uploadImageToCloudinary}
      />

      {/* ============================= EDIT PRODUCT MODAL ============================= */}
      {selectedProduct && (
        <div
          className="modal-overlay fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSavingEdit) {
              setSelectedProduct(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-product-title"
            className="modal-content my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2
                  id="edit-product-title"
                  className="text-2xl font-bold text-slate-900"
                >
                  Edit Product
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Update your product information and availability.
                </p>
              </div>

              <button
                type="button"
                disabled={isSavingEdit}
                onClick={() => setSelectedProduct(null)}
                className="close-btn rounded-lg px-3 py-2 text-slate-500 transition hover:bg-slate-100"
                aria-label="Close edit dialog"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProductEdit} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Product Name
                </label>
                <input
                  name="name"
                  value={editForm.name}
                  onChange={handleEditInputChange}
                  required
                  className="form-input w-full rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none transition focus:border-emerald-500 focus:shadow-md focus:shadow-emerald-200"
                  placeholder="e.g., Premium Laptop Stand"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    Retail Price (KES)
                  </label>
                  <input
                    name="price"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editForm.price}
                    onChange={handleEditInputChange}
                    required
                    className="form-input w-full rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none transition focus:border-emerald-500 focus:shadow-md focus:shadow-emerald-200"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    Affiliate Commission (KES)
                  </label>
                  <input
                    name="affiliateCommission"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.affiliateCommission}
                    onChange={handleEditInputChange}
                    required
                    className="form-input w-full rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none transition focus:border-emerald-500 focus:shadow-md focus:shadow-emerald-200"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    Quantity in Stock
                  </label>
                  <input
                    name="quantity"
                    type="number"
                    min="0"
                    step="1"
                    value={editForm.quantity}
                    onChange={handleEditInputChange}
                    required
                    className="form-input w-full rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none transition focus:border-emerald-500 focus:shadow-md focus:shadow-emerald-200"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    Delivery Fee (KES)
                  </label>
                  <input
                    name="deliveryFee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.deliveryFee}
                    onChange={handleEditInputChange}
                    className="form-input w-full rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none transition focus:border-emerald-500 focus:shadow-md focus:shadow-emerald-200"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Category
                </label>
                <input
                  name="category"
                  value={editForm.category}
                  onChange={handleEditInputChange}
                  className="form-input w-full rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none transition focus:border-emerald-500 focus:shadow-md focus:shadow-emerald-200"
                  placeholder="e.g., Electronics"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Product Description
                </label>
                <textarea
                  name="description"
                  value={editForm.description}
                  onChange={handleEditInputChange}
                  rows={3}
                  className="form-input w-full resize-y rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none transition focus:border-emerald-500 focus:shadow-md focus:shadow-emerald-200"
                  placeholder="Describe your product..."
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setSelectedProduct(null)}
                  className="btn-cancel rounded-lg border border-slate-300 bg-slate-50 px-5 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="btn-save rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-2 text-sm font-bold text-white shadow-md shadow-emerald-600/30 transition duration-200 hover:from-emerald-700 hover:to-emerald-600 disabled:cursor-wait disabled:opacity-60"
                >
                  {isSavingEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
