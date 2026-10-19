
import { useEffect, useState } from "react";
import apiClient from "../../../services/apiClient";

function formatKsh(value) {
  return `KSh ${Number(value || 0).toLocaleString("en-KE")}`;
}

function resolveImageUrl(imageUrl) {
  if (typeof imageUrl !== "string" || !imageUrl.trim()) {
    return "";
  }

  const source = imageUrl.trim();

  if (/^(https?:\/\/|data:)/i.test(source)) {
    return source;
  }

  const baseURL = apiClient.defaults.baseURL;

  if (!baseURL) return source;

  try {
    const base = new URL(baseURL, window.location.origin);
    const basePath = base.pathname.replace(/\/api\/?$/, "").replace(/\/$/, "");
    const imagePath = source.startsWith("/")
      ? source
      : `/${source}`;

    return `${base.origin}${basePath}${imagePath}`;
  } catch {
    return source;
  }
}

function CartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 4h2l2.2 10.1a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 8H6"
      />
      <circle cx="10" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ImagePlaceholder() {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-3 text-[#075b43]"
      aria-label="Product image unavailable"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="h-8 w-8"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 8h18l-2 12H5L3 8Zm5 0 4-5 4 5M9 12v4m6-4v4"
          />
        </svg>
      </div>
      <span className="text-[11px] font-semibold text-slate-400">
        Product image unavailable
      </span>
    </div>
  );
}

export default function ProductCard({
  product,
  onClick,
  onAddToBasket,
}) {
  const [imageFailed, setImageFailed] = useState(false);

  const productId = product?._id || product?.id;
  const imageUrl = resolveImageUrl(product?.imageUrl);

  const retailPrice = Number(product?.price || 0);
  const originalPrice = Number(product?.originalPrice || 0);
  const commission = Number(product?.affiliateCommission || 0);
  const stockCount = Number(product?.quantity || 0);
  const deliveryFee = Number(product?.deliveryFee || 0);

  const hasOffer =
    originalPrice > retailPrice && originalPrice > 0;

  const discountPercent = hasOffer
    ? Math.round(
        ((originalPrice - retailPrice) / originalPrice) * 100
      )
    : 0;

  const hasStock = stockCount > 0;
  const rating = Number(product?.rating);
  const reviewCount = Number(
    product?.reviewCount ?? product?.reviewsCount ?? 0
  );

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  const handleViewProduct = () => {
    if (productId != null) {
      onClick?.(productId);
    }
  };

  const handleAddToBasket = () => {
    if (!hasStock || !onAddToBasket) return;
    onAddToBasket(product);
  };

  return (
    <article className="group relative flex h-full w-full flex-col overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_3px_12px_rgba(16,49,34,0.035)] transition duration-300 hover:-translate-y-1 hover:border-emerald-900/15 hover:shadow-[0_15px_35px_rgba(16,49,34,0.10)]">

      {/* PRODUCT IMAGE AND BADGES */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-[#f6faf6] to-[#edf5ee] p-4">

        <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-24px)] items-center justify-between gap-2">
          <span className="rounded-full border border-white/80 bg-white/95 px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#075b43] shadow-sm">
            SokoDigi
          </span>
        </div>

        <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-2">
          {hasOffer && (
            <span className="rounded-full bg-rose-600 px-2.5 py-1.5 text-[9px] font-extrabold tracking-wide text-white shadow-sm">
              {discountPercent}% OFF
            </span>
          )}

          <span
            className={`rounded-full border px-2.5 py-1 text-[9px] font-bold ${
              hasStock
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {hasStock ? "In stock" : "Out of stock"}
          </span>
        </div>

        {imageUrl && !imageFailed ? (
          <img
            src={imageUrl}
            alt={product?.name || "Marketplace product"}
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-contain p-3 transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <ImagePlaceholder />
        )}

        {/* AFFILIATE COMMISSION */}
        {commission > 0 && (
          <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-full border border-emerald-100 bg-white/95 py-2 pl-2.5 pr-3 shadow-md backdrop-blur-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-[#08784d]">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 2v20m5-15H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H6"
                />
              </svg>
            </span>

            <span>
              <span className="block text-[8px] font-bold uppercase tracking-wide text-slate-400">
                Earn per sale
              </span>
              <span className="block text-xs font-black text-[#075b43]">
                {formatKsh(commission)}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* PRODUCT INFORMATION */}
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">

        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.13em] text-emerald-700">
            {product?.brandName || "SokoDigi Seller"}
          </p>

          <h3
            title={product?.name || "Marketplace product"}
            className="mt-1.5 line-clamp-1 text-[15px] font-extrabold tracking-tight text-slate-800 transition-colors group-hover:text-[#08784d]"
          >
            {product?.name || "Untitled product"}
          </h3>

          <p className="mt-1.5 line-clamp-2 min-h-9 text-xs leading-[18px] text-slate-500">
            {product?.description ||
              "Discover this product from the SokoDigi marketplace community."}
          </p>
        </div>

        {/* CATEGORY AND REAL RATING, WHEN AVAILABLE */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="max-w-full truncate rounded-lg border border-emerald-900/[0.07] bg-emerald-50/70 px-2.5 py-1.5 text-[10px] font-bold capitalize text-[#075b43]">
            {product?.category || "General"}
          </span>

          {Number.isFinite(rating) && rating > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600">
              <span className="text-amber-500" aria-hidden="true">
                ★
              </span>
              {rating.toFixed(1)}
              {reviewCount > 0 && (
                <span className="font-medium text-slate-400">
                  ({reviewCount})
                </span>
              )}
            </span>
          )}
        </div>

        {/* PRICING PANEL */}
        <div className="rounded-2xl border border-emerald-900/[0.07] bg-[#f7faf7] px-3.5 py-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
            Selling price
          </p>

          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-xl font-black tracking-tight text-[#075b43]">
              {formatKsh(retailPrice)}
            </span>

            {hasOffer && (
              <span className="text-xs font-semibold text-slate-400 line-through">
                {formatKsh(originalPrice)}
              </span>
            )}
          </div>

          {hasOffer && (
            <p className="mt-1 text-[10px] font-semibold text-emerald-700">
              You save {formatKsh(originalPrice - retailPrice)}
            </p>
          )}
        </div>

        {/* STOCK AND DELIVERY */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold text-slate-400">
              Availability
            </p>
            <p className="mt-1 truncate text-[11px] font-extrabold text-slate-700">
              {stockCount.toLocaleString("en-KE")} units
            </p>
          </div>

          <div className="min-w-0 text-right">
            <p className="text-[9px] font-semibold text-slate-400">
              Delivery fee
            </p>
            <p className="mt-1 truncate text-[11px] font-extrabold text-slate-700">
              {formatKsh(deliveryFee)}
            </p>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="mt-auto grid grid-cols-[1fr_44px] gap-2 pt-1">
          <button
            type="button"
            onClick={handleAddToBasket}
            disabled={!hasStock || !onAddToBasket}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#08784d] px-3 py-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#065f3c] focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
            aria-label={`Add ${product?.name || "product"} to basket`}
            title={
              !hasStock
                ? "Product is out of stock"
                : !onAddToBasket
                  ? "Basket action must be connected"
                  : "Add to basket"
            }
          >
            <CartIcon />
            <span>Add to Basket</span>
          </button>

          <button
            type="button"
            onClick={handleViewProduct}
            disabled={productId == null || !onClick}
            className="flex min-h-11 items-center justify-center rounded-xl border border-emerald-900/15 bg-white text-[#075b43] transition hover:border-emerald-700 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            title="View product details"
            aria-label={`View ${product?.name || "product"} details`}
          >
            <EyeIcon />
          </button>
        </div>
      </div>
    </article>
  );
}
