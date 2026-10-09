
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../auth/hooks/useAuth";
import { uploadImageToCloudinary } from "../../utils/cloudinaryUploader";
import AddProductModal from "./AddProductModal";

const API_URL = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "" : "http://localhost:5000")
).replace(/\/$/, "");

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

  const getAuthHeaders = useCallback(
    async (json = false) => {
      const token = await auth?.currentUser?.getIdToken();

      if (!token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      return {
        Authorization: `Bearer ${token}`,
        ...(json ? { "Content-Type": "application/json" } : {}),
      };
    },
    [auth?.currentUser]
  );

  const readResponse = async (response) => {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.reason ||
          data.message ||
          data.error ||
          `Request failed with status ${response.status}`
      );
    }

    return data;
  };

  const fetchShopData = useCallback(async () => {
    if (!auth?.currentUser) {
      setAllProducts([]);
      setSalesOrders([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const headers = await getAuthHeaders();

      const [productsResponse, ordersResponse] = await Promise.all([
        fetch(`${API_URL}/api/products?status=all`, { headers }),
        fetch(`${API_URL}/api/orders`, { headers }),
      ]);

      const productsData = await readResponse(productsResponse);
      const ordersData = await readResponse(ordersResponse);

      const products =
        productsData?.feed ??
        productsData?.products ??
        productsData;

      const orders =
        ordersData?.orders ??
        ordersData?.feed ??
        ordersData;

      setAllProducts(Array.isArray(products) ? products : []);
      setSalesOrders(Array.isArray(orders) ? orders : []);
    } catch (error) {
      console.error("Failed to load shop dashboard:", error);
      alert(error.message || "Unable to load your shop data.");
    } finally {
      setIsLoading(false);
    }
  }, [auth?.currentUser, getAuthHeaders]);

  useEffect(() => {
    fetchShopData();
  }, [fetchShopData]);

  const handleToggleProductVisibility = async (product) => {
    const productId = product._id || product.id;

    if (!productId) {
      alert("This product has no valid ID.");
      return;
    }

    const previousStatus = product.status;
    const targetStatus =
      previousStatus === "UNLISTED" ? "ACTIVE" : "UNLISTED";

    setBusyProductId(productId);

    // Optimistically update the interface.
    setAllProducts((previous) =>
      previous.map((item) =>
        (item._id || item.id) === productId
          ? { ...item, status: targetStatus }
          : item
      )
    );

    try {
      const headers = await getAuthHeaders(true);

      const response = await fetch(
        `${API_URL}/api/products/${productId}/status`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: targetStatus }),
        }
      );

      const data = await readResponse(response);

      if (data.product) {
        setAllProducts((previous) =>
          previous.map((item) =>
            (item._id || item.id) === productId
              ? data.product
              : item
          )
        );
      }
    } catch (error) {
      console.error("Failed to update product visibility:", error);

      // Restore the original state if the request fails.
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

    setAllProducts((previous) =>
      previous.filter((item) => (item._id || item.id) !== productId)
    );

    try {
      const headers = await getAuthHeaders();

      const response = await fetch(
        `${API_URL}/api/products/${productId}`,
        {
          method: "DELETE",
          headers,
        }
      );

      await readResponse(response);
    } catch (error) {
      console.error("Failed to delete product:", error);
      setAllProducts(previousProducts);
      alert(error.message || "Could not delete this product.");
    } finally {
      setBusyProductId(null);
    }
  };

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

  const handleEditInputChange = (event) => {
    const { name, value } = event.target;

    setEditForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSaveProductEdit = async (event) => {
    event.preventDefault();

    if (!selectedProduct) return;

    const productId = selectedProduct._id || selectedProduct.id;
    const price = Number(editForm.price);
    const commission = Number(editForm.affiliateCommission);
    const quantity = Number(editForm.quantity);
    const deliveryFee = Number(editForm.deliveryFee || 0);

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

      const response = await fetch(
        `${API_URL}/api/products/${productId}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            name: editForm.name.trim(),
            price,
            affiliateCommission: commission,
            quantity,
            deliveryFee,
            category: editForm.category.trim(),
            description: editForm.description.trim(),
            imageUrl: editForm.imageUrl.trim(),
          }),
        }
      );

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
      alert("Product updated successfully.");
    } catch (error) {
      console.error("Failed to update product:", error);
      alert(error.message || "Could not update the product.");
    } finally {
      setIsSavingEdit(false);
    }
  };

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
      console.error("Delivery PIN verification failed:", error);
      alert(error.message || "Could not verify the delivery PIN.");
    }
  };

  const handlePinInputChange = (orderNumber, value) => {
    setPinInputs((previous) => ({
      ...previous,
      [orderNumber]: value.replace(/\D/g, "").slice(0, 6),
    }));
  };

  const isUnlisted = (product) => product.status === "UNLISTED";

  return (
    <div className="min-h-screen bg-slate-50 font-sans antialiased text-slate-600">
      {/* SIDEBAR */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-800 bg-slate-900 text-slate-300 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 p-6">
          <h1 className="flex items-center gap-2 text-lg font-black tracking-tight text-white">
            🚀 Soko<span className="text-emerald-400">Digi</span>
          </h1>

          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            PRO
          </span>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto p-4">
          <button
            type="button"
            onClick={() => setActiveTab("inventory")}
            className={`w-full rounded-xl px-4 py-3 text-left text-xs font-bold transition ${
              activeTab === "inventory"
                ? "bg-emerald-600 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            📦 Warehouse Inventory
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("orders")}
            className={`w-full rounded-xl px-4 py-3 text-left text-xs font-bold transition ${
              activeTab === "orders"
                ? "bg-emerald-600 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            📋 Sales Orders
          </button>

          <div className="mt-4 border-t border-slate-800/60 pt-4">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-xs font-bold text-white transition hover:bg-slate-700"
            >
              ➕ List New Asset
            </button>
          </div>
        </nav>

        <div className="flex items-center gap-3 border-t border-slate-800 bg-slate-950/40 p-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-xs font-bold text-emerald-400">
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

      {/* MAIN CONTENT */}
      <main className="min-h-screen pl-64">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 shadow-sm md:px-8">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
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

        <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center space-y-3 rounded-2xl border border-slate-200 bg-white py-32">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500/20 border-t-emerald-600" />
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Loading your shop...
              </p>
            </div>
          ) : (
            <>
              {/* INVENTORY */}
              {activeTab === "inventory" && (
                <section className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/50 p-6">
                    <div>
                      <h2 className="text-base font-bold text-slate-800">
                        Stock Registry
                      </h2>
                      <p className="mt-1 text-xs text-slate-400">
                        Manage your products, prices, and store visibility.
                      </p>
                    </div>

                    <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                      Total Items: {allProducts.length}
                    </span>
                  </div>

                  {allProducts.length === 0 ? (
                    <div className="p-16 text-center">
                      <p className="text-sm font-bold text-slate-700">
                        Your stockroom is empty
                      </p>
                      <p className="mx-auto mt-1 max-w-xs text-xs text-slate-400">
                        Select “List New Asset” to add your first product.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            <th className="p-4 pl-6">Product Details</th>
                            <th className="p-4">SKU / Code</th>
                            <th className="p-4">Retail Price</th>
                            <th className="p-4">Affiliate Commission</th>
                            <th className="p-4 pr-6 text-right">Actions</th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100 text-xs">
                          {allProducts.map((product, index) => {
                            const productId = product._id || product.id;
                            const unlisted = isUnlisted(product);
                            const busy = busyProductId === productId;

                            return (
                              <tr
                                key={productId || index}
                                className={`transition ${
                                  unlisted
                                    ? "bg-slate-50/60 text-slate-400"
                                    : "hover:bg-slate-50/50"
                                }`}
                              >
                                <td className="p-4 pl-6">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`font-bold ${
                                        unlisted
                                          ? "text-slate-400"
                                          : "text-slate-900"
                                      }`}
                                    >
                                      {product.name || "Unnamed Product"}
                                    </span>

                                    {unlisted && (
                                      <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-700">
                                        Unlisted
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td className="p-4 font-mono text-slate-500">
                                  {product.productCode || product.sku || "N/A"}
                                </td>

                                <td className="p-4">
                                  KES {Number(product.price || 0).toLocaleString()}
                                </td>

                                <td className="p-4 font-bold text-emerald-600">
                                  KES{" "}
                                  {Number(
                                    product.affiliateCommission || 0
                                  ).toLocaleString()}
                                </td>

                                <td className="p-4 pr-6">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() =>
                                        handleToggleProductVisibility(product)
                                      }
                                      className={`rounded-lg border p-2 transition disabled:cursor-wait disabled:opacity-50 ${
                                        unlisted
                                          ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
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
                                      className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
                                      title="Edit product"
                                    >
                                      ✏️
                                    </button>

                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => handleDeleteProduct(product)}
                                      className="rounded-lg border border-red-200 bg-white p-2 text-red-500 transition hover:bg-red-50 disabled:opacity-50"
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

              {/* SALES ORDERS */}
              {activeTab === "orders" && (
                <section className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
                  <div className="border-b border-slate-100 bg-slate-50/50 p-6">
                    <h2 className="text-base font-bold text-slate-800">
                      Sales Orders
                    </h2>
                    <p className="mt-1 text-xs text-slate-400">
                      Verify customer delivery PINs for eligible orders.
                    </p>
                  </div>

                  {salesOrders.length === 0 ? (
                    <div className="p-16 text-center">
                      <p className="text-sm font-bold text-slate-700">
                        No transactions recorded
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Your orders will appear here when available.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            <th className="p-4 pl-6">Order ID</th>
                            <th className="p-4">Customer</th>
                            <th className="p-4">Order Value</th>
                            <th className="p-4">Status</th>
                            <th className="p-4 pr-6 text-right">Verification</th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                          {salesOrders.map((order, index) => {
                            const orderKey =
                              order.orderNumber || order._id || order.id || index;
                            const delivered = order.orderStatus === "DELIVERED";

                            return (
                              <tr key={orderKey} className="hover:bg-slate-50/50">
                                <td className="p-4 pl-6 font-mono font-bold text-slate-900">
                                  #{order.orderNumber || order._id || "N/A"}
                                </td>

                                <td className="p-4">
                                  <div className="font-semibold text-slate-800">
                                    {order.shippingDetails?.fullName ||
                                      "Guest Account"}
                                  </div>
                                  <div className="mt-1 text-[10px] text-slate-400">
                                    {order.shippingDetails?.phoneNumber ||
                                      "No Contact"}
                                  </div>
                                </td>

                                <td className="p-4 font-bold text-slate-900">
                                  KES{" "}
                                  {Number(order.totalPrice || 0).toLocaleString()}
                                </td>

                                <td className="p-4">
                                  <span
                                    className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${
                                      delivered
                                        ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                                        : "border-amber-100 bg-amber-50 text-amber-700"
                                    }`}
                                  >
                                    {delivered ? "Delivered" : order.orderStatus || "Pending"}
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
                                        className="w-28 rounded-lg border border-slate-200 px-2 py-2 text-center font-mono text-xs font-bold tracking-widest outline-none focus:border-emerald-500"
                                      />

                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleVerifyDeliveryPin(order.orderNumber)
                                        }
                                        className="rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white transition hover:bg-slate-800"
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

      {/* ADD PRODUCT MODAL */}
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

      {/* EDIT PRODUCT MODAL */}
      {selectedProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4"
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
            className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2
                  id="edit-product-title"
                  className="text-lg font-bold text-slate-900"
                >
                  Edit Product
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Update your product information.
                </p>
              </div>

              <button
                type="button"
                disabled={isSavingEdit}
                onClick={() => setSelectedProduct(null)}
                className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close edit dialog"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProductEdit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">
                  Product Name
                </label>
                <input
                  name="name"
                  value={editForm.name}
                  onChange={handleEditInputChange}
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">
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
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">
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
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">
                    Quantity
                  </label>
                  <input
                    name="quantity"
                    type="number"
                    min="0"
                    step="1"
                    value={editForm.quantity}
                    onChange={handleEditInputChange}
                    required
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">
                    Delivery Fee (KES)
                  </label>
                  <input
                    name="deliveryFee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.deliveryFee}
                    onChange={handleEditInputChange}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">
                  Category
                </label>
                <input
                  name="category"
                  value={editForm.category}
                  onChange={handleEditInputChange}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">
                  Description
                </label>
                <textarea
                  name="description"
                  value={editForm.description}
                  onChange={handleEditInputChange}
                  rows={3}
                  className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setSelectedProduct(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
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

