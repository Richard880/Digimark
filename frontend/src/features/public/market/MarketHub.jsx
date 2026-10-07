import { useEffect, useState, useMemo } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import apiClient from "../../../services/apiClient";
import ProductCard from "./ProductCard"; // 🎯 IMPORTED NEW MODULE HERE

export default function MarketHub() {
  const navigate = useNavigate();
  const outletContext = useOutletContext() || {};
  const { searchResults, isSearching, activeQuery = "" } = outletContext;
  const [allProducts, setAllProducts] = useState([]);
  const [statusMessage, setStatusMessage] = useState("Exploring the market...");
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadProducts = async () => {
      try {
        const response = await apiClient.get("/products", { params: { status: "LISTED" } });
        if (!cancelled) {
          const data = response.data || [];
          setAllProducts(data);
        }
      } catch (error) {
        console.error("Product catalog fetch failed:", error);
        if (!cancelled) setStatusMessage("Unable to connect to the SokoDigi marketplace.");
      } finally {
        if (!cancelled) setIsLoadingFeed(false);
      }
    };
    loadProducts();
    return () => { cancelled = true; };
  }, []);

  const displayedProducts = useMemo(() => {
    const query = activeQuery.trim().toLowerCase();
    if (query.length >= 2 && searchResults?.length) return searchResults;
    if (query.length >= 2) {
      return allProducts.filter((product) =>
        [product.name, product.brandName, product.category].some((value) =>
          String(value || "").toLowerCase().includes(query)
        )
      );
    }
    return allProducts;
  }, [activeQuery, searchResults, allProducts]);

  const handleProductClick = (productId) => navigate(`/product-details/${productId}`);
  const isFeedEmpty = displayedProducts.length === 0;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8">
      {/* BANNER BRAND WRAPPER */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-emerald-800 via-emerald-900 to-slate-900 text-white p-8 md:p-12 shadow-xl">
        <div className="relative z-10 max-w-2xl space-y-4">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            SokoDigi Marketplace
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-tight">
            Discover products from the digital market community.
          </h1>
          <p className="text-sm md:text-base text-emerald-100/80 leading-relaxed">
            Browse listed products from SokoDigi sellers and discover businesses, brands and opportunities in one marketplace.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-baseline border-b border-slate-100 pb-3">
          <h2 className="text-xl font-bold text-slate-800">Marketplace</h2>
          {activeQuery && <span className="text-xs text-slate-400">Filtered by: "{activeQuery}"</span>}
        </div>

        {(isLoadingFeed || isSearching) && (
          <div className="flex items-center justify-center py-20 text-sm text-slate-500">Loading products...</div>
        )}

        {!isLoadingFeed && !isSearching && isFeedEmpty && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-white border border-slate-100 rounded-2xl">
            <p className="text-base font-bold text-slate-800">No products found</p>
            <p className="text-xs text-slate-400 mt-1">{statusMessage}</p>
          </div>
        )}

        {/* 🎯 INTEGRATED COMPONENT MAP GRID BLOCK */}
        {!isLoadingFeed && !isSearching && !isFeedEmpty && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {displayedProducts.map((product) => (
              <ProductCard
                key={product._id || product.id}
                product={product}
                onClick={handleProductClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
