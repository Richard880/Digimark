import { useEffect, useState, useMemo } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import apiClient from "../../../services/apiClient";
import useAuth from "../../auth/hooks/useAuth"; // 🎯 EXTRACTS ACTIVE USER SECTOR PROFILE
import ProductCard from "./ProductCard";
import HeroSlider from "./HeroSlider"; 

export default function MarketHub() {
  const navigate = useNavigate();
  const { auth } = useAuth(); 
  const loggedInUser = auth?.currentUser;

  const outletContext = useOutletContext() || {};
  const { searchResults, isSearching, activeQuery = "" } = outletContext;
  
  const [allProducts, setAllProducts] = useState([]);
  const [statusMessage, setStatusMessage] = useState("Exploring the market...");
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  
  // 🎯 NEW STATE: Track the active engagement filter selection
  const [smartFilter, setSmartFilter] = useState("all"); // 'all', 'best-sellers', 'top-products', 'fresh-drops'

  useEffect(() => {
    let cancelled = false;
    
    const loadProducts = async () => {
      try {
        setIsLoadingFeed(true);
        const token = loggedInUser?.getIdToken ? await loggedInUser.getIdToken() : null;
        
        // 🚀 DYNAMIC ROUTE REDIRECTION BASED ON CHIP STATE
        let targetEndpoint = "/products";
        let config = {
          params: { status: "LISTED" },
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        };

        if (smartFilter !== "all") {
          targetEndpoint = "/products/discovery";
          config.params = { type: smartFilter }; // Routes to our new switch statement layers
        }

        const response = await apiClient.get(targetEndpoint, config);
        
        if (!cancelled) {
          const dataArray = response.data?.feed || response.data || [];
          setAllProducts(Array.isArray(dataArray) ? dataArray : []);
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
  }, [loggedInUser, smartFilter]); // 🎯 RE-FETCH ON CHIP CLICK: Re-runs instantly whenever the active filter state changes

  const displayedProducts = useMemo(() => {
    const query = activeQuery.trim().toLowerCase();
    
    const safeAllProducts = Array.isArray(allProducts) ? allProducts : [];
    const safeSearchResults = Array.isArray(searchResults) ? searchResults : [];

    if (query.length >= 2 && safeSearchResults.length) return safeSearchResults;
    if (query.length >= 2) {
      return safeAllProducts.filter((product) =>
        product && [product.name, product.brandName, product.category].some((value) =>
          String(value || "").toLowerCase().includes(query)
        )
      );
    }
    return safeAllProducts;
  }, [activeQuery, searchResults, allProducts]);

  const handleProductClick = (productId) => navigate(`/product-details/${productId}`);
  const isFeedEmpty = !Array.isArray(displayedProducts) || displayedProducts.length === 0;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8">
      <HeroSlider 
        products={Array.isArray(allProducts) ? allProducts : []} 
        onProductClick={handleProductClick} 
      />

      {/* =========================================================================
          🚀 NEW COMPONENT RENDERING: SMART ENGAGEMENT NAVIGATION CHIPS
         ========================================================================= */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-4">
        {[
          { id: "all", label: "🛒 All Items" },
          { id: "best-sellers", label: "🔥 Best Sellers" },
          { id: "top-products", label: "💎 Top Brands" },
          { id: "fresh-drops", label: "🆕 Fresh Drops" }
        ].map((chip) => (
          <button
            key={chip.id}
            onClick={() => setSmartFilter(chip.id)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-200 cursor-pointer border ${
              smartFilter === chip.id
                ? "bg-slate-900 border-slate-900 text-white shadow-xs"
                : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* MAIN CATALOG FEED GRID CONTAINER */}
      <div className="space-y-4">
        <div className="flex justify-between items-baseline border-b border-slate-100 pb-3">
          <h2 className="text-xl font-bold text-slate-800">
            {smartFilter === "all" && "Marketplace"}
            {smartFilter === "best-sellers" && "Hot Trending Products"}
            {smartFilter === "top-products" && "Verified Supplier Showcases"}
            {smartFilter === "fresh-drops" && "Fresh Warehouse Arrivals"}
          </h2>
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
