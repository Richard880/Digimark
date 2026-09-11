import { useEffect, useState, useMemo } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import apiClient from "../../../services/apiClient";

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

        {!isLoadingFeed && !isSearching && !isFeedEmpty && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {displayedProducts.map((product) => {
              const productId = product._id || product.id;
              const imageUrl = product.imageUrl?.startsWith("http")
                ? product.imageUrl
                : `${apiClient.defaults.baseURL.replace(/\/api\/?$/, "")}${product.imageUrl || ""}`;

              return (
                <button
                  type="button"
                  key={productId}
                  onClick={() => handleProductClick(productId)}
                  className="group bg-white border border-slate-200/70 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-emerald-600/40 transition-all text-left flex flex-col h-full"
                >
                  <div className="relative aspect-video w-full bg-slate-50 overflow-hidden border-b border-slate-100">
                    <img src={imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
                  </div>
                  <div className="p-4 flex flex-col gap-2">
                    <p className="text-sm font-medium text-slate-600">{product.brandName || "SokoDigi Seller"}</p>
                    <h3 className="text-lg font-bold text-slate-800">{product.name}</h3>
                    <p className="text-2xl font-extrabold text-emerald-600">KSh {Number(product.price || 0).toLocaleString()}</p>
                    <p className="text-sm text-slate-500">Delivery: KSh {Number(product.deliveryFee || 0).toLocaleString()}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
