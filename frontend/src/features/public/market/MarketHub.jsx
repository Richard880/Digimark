import { useEffect, useState, useMemo } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import apiClient from "../../../services/apiClient";
import useAuth from "../../auth/hooks/useAuth"; // 🎯 ADDED: Import your custom session context
import ProductCard from "./ProductCard";
import HeroSlider from "./HeroSlider"; 

export default function MarketHub() {
  const navigate = useNavigate();
  const { auth } = useAuth(); // 🎯 ADDED: Extract active auth engine details
  const loggedInUser = auth?.currentUser;

  const outletContext = useOutletContext() || {};
  const { searchResults, isSearching, activeQuery = "" } = outletContext;
  const [allProducts, setAllProducts] = useState([]);
  const [statusMessage, setStatusMessage] = useState("Exploring the market...");
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    
    const loadProducts = async () => {
      try {
        setIsLoadingFeed(true);
        
        // 🔒 AUTH HANDSHAKE: Pull the live cryptographic session token if logged in
        const token = loggedInUser?.getIdToken ? await loggedInUser.getIdToken() : null;
        
        // Build request parameters and inject authorization headers seamlessly
        const config = {
          params: { status: "LISTED" },
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        };

        const response = await apiClient.get("/products", config);
        
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
  }, [loggedInUser]); // 🎯 WATCH INSTANCE: Re-run immediately as soon as the user profile session hydrates

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
