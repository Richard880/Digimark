
import { useState, useRef } from "react";
import useAuth from "../../auth/hooks/useAuth";

const SUB_CATEGORY_MAP = {
  "phones-gadgets": [
    { id: "smartphones", label: "📱 Smartphones & Tablets" },
    { id: "charging-power", label: "🔌 Charging & Power Banks" },
    { id: "audio-sound", label: "🎧 Audio & Sound Accessories" },
  ],

  "tech-computing": [
    { id: "laptops-desktops", label: "💻 Laptops & Desktop PCs" },
    { id: "storage-devices", label: "💾 Hard Drives & SSD Storage" },
    {
      id: "printers-networking",
      label: "🖨️ Printers & Router Network Gear",
    },
  ],

  "apparel-fashion": [
    { id: "footwear", label: "👟 Footwear & Shoes" },
    { id: "casual-wear", label: "👕 Casual Apparel" },
    { id: "bags-watches", label: "👜 Luxury Bags & Watches" },
  ],

  "home-appliances": [
    { id: "kitchen-appliances", label: "🍳 Kitchen & Cooking Tools" },
    { id: "living-decor", label: "🏠 Home Decor & Lighting" },
    {
      id: "smart-security",
      label: "🔒 Automation & Handset Security",
    },
  ],

  "beauty-personal-care": [
    { id: "skin-care", label: "🧴 Targeted Skin Care" },
    { id: "hair-wigs", label: "💇 Hair Care, Extensions & Wigs" },
    {
      id: "makeup-cosmetics",
      label: "💄 Cosmetics & Makeup Essentials",
    },
  ],

  "ankara-art": [
    {
      id: "cultural-wear",
      label: "👗 Ankara Outfits & Fashion Fabric",
    },
    {
      id: "wall-art",
      label: "🖼️ Handcrafted Decor & Paintings",
    },
  ],

  general: [
    {
      id: "miscellaneous",
      label: "📦 General Retail Goods",
    },
  ],
};

const API_URL = import.meta.env.PROD
  ? ""
  : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(
      /\/$/,
      ""
    );

export default function AddProductModal({
  isOpen,
  onClose,
  onSuccess,
  uploadImageToCloudinary,
}) {
  const { auth } = useAuth();
  const fileInputRef = useRef(null);

  const [isCommitting, setIsCommitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    price: "",
    affiliateCommission: "",
    quantity: "",
    category: "phones-gadgets",
    subCategory: "smartphones",
    description: "",
    brandName: auth?.profile?.brandName || "",
  });

  if (!isOpen) {
    return null;
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];

    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleCommitProductStream = async (e) => {
    e.preventDefault();

    if (!selectedFile) {
      alert(
        "Please select a product thumbnail graphic to display."
      );
      return;
    }

    if (!formData.name.trim()) {
      alert("Product title cannot be empty.");
      return;
    }

    const price = Number(formData.price);
    const affiliateCommission = Number(
      formData.affiliateCommission
    );
    const quantity = Number(formData.quantity);

    if (price <= 0) {
      alert("Please set a valid retail price.");
      return;
    }

    if (
      affiliateCommission < 0 ||
      affiliateCommission >= price
    ) {
      alert("Invalid Commission split value parameters.");
      return;
    }

    if (quantity <= 0) {
      alert("Stock levels must register at least 1 unit.");
      return;
    }

    setIsCommitting(true);

    try {
      // Upload product image to Cloudinary
      const uploadedImageUrl = await uploadImageToCloudinary(
        selectedFile,
        "products"
      );

      if (!uploadedImageUrl) {
        throw new Error(
          "Cloudinary asset upload failure."
        );
      }

      const productPayload = {
        name: formData.name.trim(),
        price,
        affiliateCommission,
        wholesalePrice: price - affiliateCommission,
        quantity,
        category: formData.category.toLowerCase(),
        subCategory: formData.subCategory.toLowerCase(),
        description: formData.description.trim(),
        brandName:
          formData.brandName ||
          auth?.profile?.brandName ||
          "SokoDigi Merchant",
        imageUrl: uploadedImageUrl,
      };

      const token =
        await auth?.currentUser?.getIdToken();

      const response = await fetch(
        `${API_URL}/api/products`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(productPayload),
        }
      );

      const responseData = await response.json();

      if (response.ok) {
        alert(
          "🎉 Inventory Asset listed successfully!"
        );

        if (onSuccess) {
          onSuccess(
            responseData.product || responseData
          );
        }

        handleClearForm();
      } else {
        throw new Error(
          responseData.reason ||
            responseData.error ||
            "Failed to list product"
        );
      }
    } catch (err) {
      console.error(
        "Error listing product:",
        err
      );

      alert(
        `Asset transaction rejected: ${
          err.message || "Unknown error"
        }`
      );
    } finally {
      setIsCommitting(false);
    }
  };

  const handleClearForm = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(null);
    setSelectedFile(null);

    setFormData({
      name: "",
      price: "",
      affiliateCommission: "",
      quantity: "",
      category: "phones-gadgets",
      subCategory: "smartphones",
      description: "",
      brandName:
        auth?.profile?.brandName || "",
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-6 relative">
        <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
          📦 List New Marketplace Product
        </h2>

        {/* Upload Image Preview Frame */}
        <div className="flex items-center gap-4 mb-4 p-3 bg-emerald-50/50 rounded-2xl border border-emerald-100/50">
          <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-xs">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Product Preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs text-slate-400 font-bold">
                No Image
              </span>
            )}
          </div>

          <div className="flex-1">
            <label className="block text-[10px] font-bold text-emerald-700 uppercase mb-1">
              Product Media Graphic
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={isCommitting}
              className="block w-full text-xs text-slate-500 file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-[10px] file:font-bold file:bg-emerald-700 file:text-white hover:file:bg-emerald-800 cursor-pointer"
            />
          </div>
        </div>

        {/* Dynamic Inputs Form */}
        <div className="space-y-3 mb-6">
          {/* Product Name */}
          <input
            type="text"
            name="name"
            placeholder="Item descriptive title..."
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                name: e.target.value,
              }))
            }
            disabled={isCommitting}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none"
          />

          {/* Price / Commission / Quantity */}
          <div className="grid grid-cols-3 gap-2">
            <input
              type="number"
              name="price"
              min="0"
              step="0.01"
              placeholder="Price (KES)..."
              value={formData.price}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  price: e.target.value,
                }))
              }
              disabled={isCommitting}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-emerald-500 focus:outline-none"
            />

            <input
              type="number"
              name="affiliateCommission"
              min="0"
              step="0.01"
              placeholder="Margin Cut..."
              value={formData.affiliateCommission}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  affiliateCommission:
                    e.target.value,
                }))
              }
              disabled={isCommitting}
              className="w-full rounded-xl border border-emerald-200 bg-emerald-50/20 px-3 py-3 text-sm text-emerald-800 font-medium focus:border-emerald-500 focus:outline-none"
            />

            <input
              type="number"
              name="quantity"
              min="1"
              step="1"
              placeholder="Stock..."
              value={formData.quantity}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  quantity: e.target.value,
                }))
              }
              disabled={isCommitting}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Two-Tier Category Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Parent Category */}
            <div className="flex flex-col space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">
                Category
              </label>

              <select
                name="category"
                value={formData.category}
                onChange={(e) => {
                  const nextCat = e.target.value;

                  const defaultSub =
                    SUB_CATEGORY_MAP[nextCat]?.[0]
                      ?.id || "miscellaneous";

                  setFormData((prev) => ({
                    ...prev,
                    category: nextCat,
                    subCategory: defaultSub,
                  }));
                }}
                disabled={isCommitting}
                className="w-full rounded-xl border border-slate-200 p-2 text-xs bg-white text-slate-700 font-bold focus:border-emerald-500 focus:outline-none cursor-pointer"
              >
                <option value="phones-gadgets">
                  📱 Phones & Gadgets
                </option>

                <option value="tech-computing">
                  💻 Tech & Computing
                </option>

                <option value="apparel-fashion">
                  👕 Apparel & Fashion
                </option>

                <option value="home-appliances">
                  🏠 Home Appliances
                </option>

                <option value="beauty-personal-care">
                  💄 Beauty & Care
                </option>

                <option value="ankara-art">
                  🎨 Ankara & Art
                </option>

                <option value="general">
                  📦 General Goods
                </option>
              </select>
            </div>

            {/* Sub Category */}
            <div className="flex flex-col space-y-1 animate-fadeIn">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">
                Intended Use/Need
              </label>

              <select
                name="subCategory"
                value={formData.subCategory}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    subCategory: e.target.value,
                  }))
                }
                disabled={isCommitting}
                className="w-full rounded-xl border border-slate-200 p-2 text-xs bg-white text-slate-700 font-bold focus:border-emerald-500 focus:outline-none cursor-pointer"
              >
                {(
                  SUB_CATEGORY_MAP[
                    formData.category
                  ] ||
                  SUB_CATEGORY_MAP.general
                ).map((sub) => (
                  <option
                    key={sub.id}
                    value={sub.id}
                  >
                    {sub.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col space-y-1">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">
              Product Specification Profile
            </label>

            <textarea
              name="description"
              placeholder="Detailed description, key features..."
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              disabled={isCommitting}
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs focus:border-emerald-500 focus:outline-none resize-none"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
          <button
            type="button"
            disabled={isCommitting}
            onClick={handleClearForm}
            className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition duration-150 cursor-pointer"
          >
            Dismiss
          </button>

          <button
            type="button"
            onClick={handleCommitProductStream}
            disabled={isCommitting}
            className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition duration-150 disabled:opacity-40 cursor-pointer"
          >
            {isCommitting
              ? "Uploading..."
              : "Commit Stream"}
          </button>
        </div>
      </div>
    </div>
  );
}
