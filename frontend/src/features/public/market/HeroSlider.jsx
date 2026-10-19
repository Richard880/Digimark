
import { useEffect, useMemo, useState } from "react";
import apiClient from "../../../services/apiClient";

const AUTOPLAY_MS = 6000;

function formatKsh(value) {
  return `KSh ${Number(value || 0).toLocaleString("en-KE")}`;
}

function resolveProductImage(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return "";

  const source = imageUrl.trim();

  if (!source) return "";

  if (/^https?:\/\//i.test(source) || source.startsWith("data:")) {
    return source;
  }

  // Preserve the configured backend origin for uploaded product images.
  const baseURL = apiClient.defaults.baseURL;

  if (!baseURL) return source;

  try {
    const origin = new URL(baseURL, window.location.origin).origin;
    const backendPath = new URL(baseURL, window.location.origin).pathname
      .replace(/\/api\/?$/, "")
      .replace(/\/$/, "");

    return `${origin}${backendPath}/${source.replace(/^\/+/, "")}`;
  } catch {
    return source;
  }
}

function ArrowIcon() {
  return (
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
        d="M5 12h14m-6-6 6 6-6 6"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="m16 16 4 4" />
    </svg>
  );
}

function TrustItem({ icon, title, description }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-emerald-200 ring-1 ring-white/10">
        {icon}
      </span>

      <div className="min-w-0">
        <p className="text-xs font-bold text-white">{title}</p>
        <p className="mt-1 text-[11px] leading-4 text-emerald-100/75">
          {description}
        </p>
      </div>
    </div>
  );
}

export default function HeroSlider({
  products = [],
  onProductClick,
}) {
  const sliderItems = useMemo(
    () => (Array.isArray(products) ? products.slice(0, 5) : []),
    [products]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setCurrentIndex(0);
  }, [products]);

  useEffect(() => {
    if (sliderItems.length <= 1 || paused) return undefined;

    const timer = setInterval(() => {
      setCurrentIndex((index) => (index + 1) % sliderItems.length);
    }, AUTOPLAY_MS);

    return () => clearInterval(timer);
  }, [sliderItems.length, paused]);

  useEffect(() => {
    setImageFailed(false);
  }, [currentIndex]);

  const activeProduct = sliderItems[currentIndex];

  const productId = activeProduct
    ? activeProduct._id || activeProduct.id
    : null;

  const imageUrl = activeProduct
    ? resolveProductImage(activeProduct.imageUrl)
    : "";

  const commission = Number(activeProduct?.affiliateCommission || 0);

  const openProduct = () => {
    if (productId != null) onProductClick?.(productId);
  };

  return (
    <section
      aria-label="SokoDigi featured marketplace"
      className="relative isolate mb-7 overflow-hidden rounded-[26px] bg-white shadow-[0_12px_38px_rgba(16,49,34,0.09)] ring-1 ring-emerald-950/5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setPaused(false);
        }
      }}
    >
      <div className="grid min-h-[390px] grid-cols-1 md:min-h-[400px] md:grid-cols-12">
        {/* LEFT: MARKETPLACE MESSAGE */}
        <div className="relative flex flex-col justify-center overflow-hidden bg-gradient-to-br from-[#075b43] via-[#034c39] to-[#062f2b] px-6 py-9 text-white sm:px-9 md:col-span-7 md:px-10 md:py-10 lg:px-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-24 -top-28 h-64 w-64 rounded-full border border-white/[0.07]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-36 left-1/3 h-72 w-72 rounded-full bg-emerald-400/[0.09] blur-3xl"
          />

          <div className="relative z-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.13em] text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              SokoDigi MarketHub
            </span>

            {activeProduct ? (
              <>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-white/90">
                    Featured product
                  </span>

                  {activeProduct.brandName && (
                    <span className="max-w-[180px] truncate rounded-full border border-white/10 px-3 py-1 text-[10px] font-medium text-emerald-100/80">
                      {activeProduct.brandName}
                    </span>
                  )}
                </div>

                <h1
                  key={productId || currentIndex}
                  className="mt-5 line-clamp-2 max-w-2xl text-[32px] font-black leading-[1.08] tracking-[-0.045em] sm:text-4xl lg:text-[46px]"
                >
                  {activeProduct.name || "Discover something exceptional."}
                </h1>

                <p className="mt-4 line-clamp-3 max-w-xl text-sm leading-6 text-emerald-50/80 sm:text-[15px]">
                  {activeProduct.description ||
                    "Discover products and businesses from the SokoDigi digital market community."}
                </p>

                <div className="mt-6 flex flex-wrap items-end gap-x-7 gap-y-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200/75">
                      Retail price
                    </p>
                    <p className="mt-1 text-2xl font-black tracking-tight text-white">
                      {formatKsh(activeProduct.price)}
                    </p>
                  </div>

                  {commission > 0 && (
                    <div className="border-l border-white/20 pl-5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200/75">
                        Affiliate commission
                      </p>
                      <p className="mt-1 text-xl font-extrabold text-emerald-300">
                        {formatKsh(commission)}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={openProduct}
                    disabled={productId == null || !onProductClick}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-xs font-extrabold text-[#075b43] shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#075b43] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    View Product
                    <ArrowIcon />
                  </button>

                  <span className="text-[11px] font-medium text-emerald-100/70">
                    Shop. Support. Grow.
                  </span>
                </div>
              </>
            ) : (
              <>
                <h1 className="mt-6 max-w-2xl text-4xl font-black leading-[1.08] tracking-[-0.045em] sm:text-5xl lg:text-[48px]">
                  Discover products from the{" "}
                  <span className="text-emerald-300">
                    digital market community.
                  </span>
                </h1>

                <p className="mt-5 max-w-lg text-sm leading-6 text-emerald-50/80 sm:text-[15px]">
                  Browse listed products from SokoDigi sellers and discover
                  businesses, brands, and opportunities in one unified
                  marketplace.
                </p>

                <div className="mt-7 flex min-h-12 max-w-lg items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4">
                  <span className="text-emerald-200">
                    <SearchIcon />
                  </span>
                  <span className="text-xs text-emerald-50/80">
                    Find products, brands and businesses
                  </span>
                </div>
              </>
            )}

            {/* TRUST STRIP */}
            <div className="mt-8 grid max-w-xl grid-cols-1 gap-4 border-t border-white/15 pt-5 sm:grid-cols-3 sm:gap-3">
              <TrustItem
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h11v11H3zM14 11h4l3 3v4h-7z" />
                    <circle cx="7.5" cy="19" r="2" />
                    <circle cx="17.5" cy="19" r="2" />
                  </svg>
                }
                title="Shop conveniently"
                description="Explore marketplace listings"
              />

              <TrustItem
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 20 6v5c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9 12 2 2 4-4" />
                  </svg>
                }
                title="Secure payments"
                description="Payment options at checkout"
              />

              <TrustItem
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                    <circle cx="9" cy="8" r="3" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 20v-2a6 6 0 0 1 12 0v2zM16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2" />
                  </svg>
                }
                title="Community driven"
                description="Buy, sell and grow together"
              />
            </div>
          </div>
        </div>

        {/* RIGHT: FEATURED PRODUCT */}
        <div className="relative flex min-h-[280px] items-center justify-center overflow-hidden bg-gradient-to-br from-[#f6faf6] via-white to-[#e7f2e9] px-6 py-8 md:col-span-5 md:min-h-0 md:px-8 lg:px-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-[-70px] top-[-70px] h-64 w-64 rounded-full border border-emerald-900/[0.06]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-[-100px] left-[-40px] h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl"
          />

          <div className="relative z-10 flex w-full max-w-md flex-col items-center">
            <div className="mb-4 flex w-full items-center justify-between gap-3">
              <span className="rounded-full border border-emerald-900/10 bg-white/90 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#075b43] shadow-sm">
                {activeProduct ? "Featured pick" : "Welcome to MarketHub"}
              </span>

              {sliderItems.length > 1 && (
                <span className="text-[11px] font-bold tabular-nums text-slate-500">
                  {String(currentIndex + 1).padStart(2, "0")} /{" "}
                  {String(sliderItems.length).padStart(2, "0")}
                </span>
              )}
            </div>

            <div className="relative flex h-[220px] w-full items-center justify-center overflow-hidden rounded-[26px] border border-white bg-white/85 p-5 shadow-[0_18px_45px_rgba(18,55,35,0.10)] sm:h-[255px] md:h-[270px] lg:h-[290px]">
              {activeProduct && imageUrl && !imageFailed ? (
                <img
                  key={`${productId}-${imageUrl}`}
                  src={imageUrl}
                  alt={activeProduct.name || "Featured marketplace product"}
                  className="h-full w-full object-contain p-2 transition-transform duration-500 hover:scale-105"
                  loading="eager"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <div className="flex max-w-xs flex-col items-center px-4 text-center">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50 text-[#075b43] ring-1 ring-emerald-900/5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-12 w-12">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h18l-2 12H5L3 8zM8 8l4-5 4 5M9 12v4m6-4v4" />
                    </svg>
                  </div>

                  <p className="mt-5 text-lg font-extrabold tracking-tight text-[#075b43]">
                    Your next great find
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Explore products and discover local businesses in the
                    SokoDigi community.
                  </p>
                </div>
              )}

              {activeProduct && imageFailed && (
                <span className="absolute bottom-3 right-3 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
                  Image unavailable
                </span>
              )}
            </div>

            {activeProduct && (
              <div className="mt-4 w-full rounded-2xl border border-emerald-900/[0.07] bg-white/90 px-4 py-3 shadow-sm">
                <p className="truncate text-sm font-extrabold text-slate-800">
                  {activeProduct.name}
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <span className="text-sm font-black text-[#08784d]">
                    {formatKsh(activeProduct.price)}
                  </span>
                  <span className="max-w-[55%] truncate text-[11px] font-medium text-slate-500">
                    {activeProduct.brandName || "SokoDigi Merchant"}
                  </span>
                </div>
              </div>
            )}

            {/* CAROUSEL CONTROLS */}
            {sliderItems.length > 1 && (
              <div className="mt-5 flex w-full items-center justify-between gap-4">
                <div className="flex items-center gap-2" aria-label="Choose featured product">
                  {sliderItems.map((item, index) => (
                    <button
                      key={item._id || item.id || index}
                      type="button"
                      onClick={() => setCurrentIndex(index)}
                      aria-label={`Show featured product ${index + 1}`}
                      aria-current={currentIndex === index ? "true" : undefined}
                      className={`h-2 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 ${
                        currentIndex === index
                          ? "w-8 bg-[#08784d]"
                          : "w-2 bg-emerald-900/20 hover:bg-emerald-900/40"
                      }`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentIndex(
                        (index) =>
                          (index - 1 + sliderItems.length) %
                          sliderItems.length
                      )
                    }
                    aria-label="Previous featured product"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-900/10 bg-white text-[#075b43] transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setCurrentIndex(
                        (index) => (index + 1) % sliderItems.length
                      )
                    }
                    aria-label="Next featured product"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-900/10 bg-white text-[#075b43] transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
