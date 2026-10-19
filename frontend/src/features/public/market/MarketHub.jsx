
import { useEffect, useMemo, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";

import apiClient from "../../../services/apiClient";
import useAuth from "../../auth/hooks/useAuth";
import ProductCard from "./ProductCard";
import HeroSlider from "./HeroSlider";

const MARKET_FILTERS = [
  { id: "all", icon: "▦", label: "All Items" },
  { id: "best-sellers", icon: "🔥", label: "Best Sellers" },
  { id: "top-products", icon: "✦", label: "Top Brands" },
  { id: "fresh-drops", icon: "✧", label: "Fresh Drops" },
];

const SECTION_TITLES = {
  all: "Marketplace",
  "best-sellers": "Best Sellers",
  "top-products": "Top Brands",
  "fresh-drops": "Fresh Drops",
};

export default function MarketHub() {
  const navigate = useNavigate();
  const { auth } = useAuth();
  const loggedInUser = auth?.currentUser;

  const outletContext = useOutletContext() || {};
  const {
    searchResults,
    isSearching = false,
    activeQuery = "",
  } = outletContext;

  const [allProducts, setAllProducts] = useState([]);
  const [bannerProducts, setBannerProducts] = useState([]);
  const [smartFilter, setSmartFilter] = useState("all");

  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  const [feedError, setFeedError] = useState("");

  // ============================================================
  // FEATURED HERO PRODUCTS
  // ============================================================

  useEffect(() => {
    let cancelled = false;

    async function loadHeroBanner() {
      try {
        const response = await apiClient.get("/products/hero-banner");

        if (cancelled) return;

        if (response.data?.ok) {
          const banner = response.data.banner;
          setBannerProducts(Array.isArray(banner) ? banner : []);
        } else {
          setBannerProducts([]);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Unable to load featured products:", error);
          setBannerProducts([]);
        }
      }
    }

    loadHeroBanner();

    return () => {
      cancelled = true;
    };
  }, []);

  // ============================================================
  // MARKETPLACE PRODUCT FEED
  // ============================================================

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setIsLoadingFeed(true);
      setFeedError("");

      try {
        const token = loggedInUser?.getIdToken
          ? await loggedInUser.getIdToken()
          : null;

        if (cancelled) return;

        let endpoint = "/products";

        const config = {
          params: { status: "LISTED" },
          headers: token
            ? { Authorization: `Bearer ${token}` }
            : {},
        };

        if (smartFilter !== "all") {
          endpoint = "/products/discovery";
          config.params = { type: smartFilter };
        }

        const response = await apiClient.get(endpoint, config);

        if (cancelled) return;

        const responseData = response.data;
        const productData =
          responseData?.feed ?? responseData?.products ?? responseData;

        if (Array.isArray(productData)) {
          setAllProducts(productData);
        } else {
          setAllProducts([]);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Marketplace feed failed:", error);
          setAllProducts([]);
          setFeedError(
            "We couldn't connect to the marketplace. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingFeed(false);
        }
      }
    }

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, [loggedInUser, smartFilter]);

  // ============================================================
  // SEARCH AND DISPLAY LOGIC
  // ============================================================

  const displayedProducts = useMemo(() => {
    const query = String(activeQuery || "").trim().toLowerCase();

    const products = Array.isArray(allProducts) ? allProducts : [];
    const externalResults = Array.isArray(searchResults)
      ? searchResults
      : [];

    if (!query) return products;

    if (externalResults.length > 0) {
      return externalResults;
    }

    return products.filter((product) => {
      if (!product) return false;

      const searchableFields = [
        product.name,
        product.brandName,
        product.category,
        product.description,
      ];

      return searchableFields.some((value) =>
        String(value || "").toLowerCase().includes(query)
      );
    });
  }, [activeQuery, searchResults, allProducts]);

  const handleProductClick = (productId) => {
    if (!productId) return;

    navigate(`/product-details/${productId}`);
  };

  const isBusy = isLoadingFeed || isSearching;
  const isFeedEmpty = displayedProducts.length === 0;
  const hasSearch = String(activeQuery || "").trim().length > 0;

  const sectionTitle = hasSearch
    ? "Search Results"
    : SECTION_TITLES[smartFilter] || "Marketplace";

  // ============================================================
  // PAGE
  // ============================================================

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-7 px-3 pb-10 sm:px-5 lg:px-7">

      {/* ========================================================
          FEATURED MARKETPLACE HERO
      ======================================================== */}

      <HeroSlider
        products={bannerProducts}
        onProductClick={handleProductClick}
      />

      {/* ========================================================
          MARKETPLACE DISCOVERY FILTERS
      ======================================================== */}

      <section aria-label="Browse marketplace collections">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold tracking-tight text-[#173c2c]">
              Explore MarketHub
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Discover products across our digital market community.
            </p>
          </div>

          {hasSearch && (
            <button
              type="button"
              onClick={() =>
                navigate("/marketplace", { replace: false })
              }
              className="rounded-full border border-emerald-900/10 bg-white px-3 py-2 text-xs font-bold text-[#075b43] transition hover:bg-emerald-50"
            >
              Clear search
            </button>
          )}
        </div>

        <div
          className="mt-4 flex gap-2 overflow-x-auto pb-2"
          role="group"
          aria-label="Filter marketplace products"
        >
          {MARKET_FILTERS.map((filter) => {
            const isActive =
              !hasSearch && smartFilter === filter.id;

            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setSmartFilter(filter.id)}
                aria-pressed={isActive}
                className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 ${
                  isActive
                    ? "border-[#075b43] bg-[#075b43] text-white shadow-md shadow-emerald-950/10"
                    : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-[#075b43]"
                }`}
              >
                <span aria-hidden="true">{filter.icon}</span>
                {filter.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* ========================================================
          PRODUCT CATALOG
      ======================================================== */}

      <section className="space-y-5" aria-labelledby="marketplace-heading">

        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-emerald-950/10 pb-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 h-10 w-1.5 shrink-0 rounded-full bg-[#078451]" />

            <div>
              <h2
                id="marketplace-heading"
                className="text-xl font-black tracking-tight text-[#173c2c] sm:text-2xl"
              >
                {sectionTitle}
              </h2>

              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                {hasSearch
                  ? `Results for "${activeQuery.trim()}"`
                  : "Featured products from our marketplace sellers."}
              </p>
            </div>
          </div>

          {!isBusy && !feedError && !isFeedEmpty && (
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-[#075b43]">
              {displayedProducts.length}{" "}
              {displayedProducts.length === 1 ? "product" : "products"}
            </span>
          )}
        </div>

        {/* LOADING STATE */}

        {isBusy && (
          <div
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            role="status"
            aria-label="Loading marketplace products"
          >
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-2xl border border-slate-100 bg-white p-3 shadow-sm"
              >
                <div className="h-48 animate-pulse rounded-xl bg-slate-100" />
                <div className="mt-4 h-4 w-3/4 animate-pulse rounded bg-slate-100" />
                <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                <div className="mt-5 h-10 animate-pulse rounded-xl bg-emerald-50" />
              </div>
            ))}
            <span className="sr-only">Loading products...</span>
          </div>
        )}

        {/* CONNECTION ERROR */}

        {!isBusy && feedError && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-amber-600">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-6 w-6"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v4m0 4h.01M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3l-7.5-13.1a2 2 0 0 0-3.4 0Z"
                />
              </svg>
            </div>

            <h3 className="mt-4 text-base font-extrabold text-slate-800">
              Marketplace temporarily unavailable
            </h3>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
              {feedError}
            </p>

            <button
              type="button"
              onClick={() => setSmartFilter((current) => current)}
              className="mt-5 rounded-full bg-[#075b43] px-5 py-3 text-xs font-extrabold text-white transition hover:bg-[#034b37]"
            >
              Retry loading
            </button>
          </div>
        )}

        {/* EMPTY STATE */}

        {!isBusy && !feedError && isFeedEmpty && (
          <div className="rounded-2xl border border-slate-100 bg-white px-6 py-14 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-[#075b43]">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
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

            <h3 className="mt-5 text-base font-extrabold text-slate-800">
              {hasSearch
                ? "No matching products found"
                : "Your marketplace is waiting"}
            </h3>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              {hasSearch
                ? "Try another product name, brand or category."
                : "There are no products to display in this collection right now. Please check back soon."}
            </p>

            {hasSearch && (
              <button
                type="button"
                onClick={() =>
                  navigate("/marketplace", { replace: false })
                }
                className="mt-5 rounded-full border border-emerald-800/15 px-5 py-2.5 text-xs font-bold text-[#075b43] transition hover:bg-emerald-50"
              >
                Browse marketplace
              </button>
            )}
          </div>
        )}

        {/* PRODUCT GRID */}

        {!isBusy && !feedError && !isFeedEmpty && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayedProducts.map((product, index) => (
              <ProductCard
                key={product._id || product.id || `product-${index}`}
                product={product}
                onClick={handleProductClick}
              />
            ))}
          </div>
        )}
      </section>

      {/* MARKETPLACE FOOTER NOTE */}

      {!isBusy && !feedError && !isFeedEmpty && (
        <div className="flex flex-col items-center justify-center gap-2 border-t border-slate-100 py-6 text-center">
          <span className="text-sm font-extrabold text-[#075b43]">
            Shop. Support. Grow.
          </span>
          <p className="text-xs text-slate-500">
            Discover more opportunities in the SokoDigi community.
          </p>
        </div>
      )}
    </main>
  );
}
