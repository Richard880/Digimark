import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom"; 
import useAuth from "../../features/auth/hooks/useAuth"; 
import Navbar from "../Navbar/Navbar"; 
import Footer from "../Footer/Footer";
import AuthModal from "../../features/auth/AuthModal"; 
import styles from "./MainLayout.module.css"; 

export default function MainLayout() { 
  const { auth, logout } = useAuth(); 
  const user = auth?.currentUser;

  // UI Modal Controls
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Live Database Search State Frameworks
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchParams, setSearchParams] = useState({ q: "", type: "" });

  // Handle live query data payload emissions from both Navbar & HomePage capsules
  const handleSearchUpdate = (searchObj) => {
    setSearchParams(searchObj);
  };

  // Debounced API Side Effect Network Dispatcher Pipeline
  useEffect(() => {
    // If the input field contains less than 2 characters, clear results automatically
    if (searchParams.q.trim().length < 2) return;

    const controller = new AbortController();
    
    const fetchBackendResults = async () => {
      setIsSearching(true);
      try {
        const queryParams = new URLSearchParams({
          q: searchParams.q,
          type: searchParams.type
        }).toString();

        // Connects natively to your Express endpoint router mapping structure
        const response = await fetch(`/api/search?${queryParams}`, {
          signal: controller.signal
        });
        
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data);
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Search pipeline network mismatch: ", err);
          setSearchResults([]);
        }
      } finally {
        setIsSearching(false);
      }
    };

    // 300ms Debounce reduces server load on rapid keystrokes
    const delayDebounceFn = setTimeout(() => {
      fetchBackendResults();
    }, 300);

    return () => {
      clearTimeout(delayDebounceFn);
      controller.abort(); // Cleans up hanging requests if a user keeps typing
    };
  }, [searchParams]);

  return ( 
    <div className={styles["sokodigi-app"]}> 
      <Navbar 
        user={user} 
        onLogout={logout} 
        onAuthClick={() => setIsAuthModalOpen(true)} 
        onSearchUpdate={handleSearchUpdate}
      />

      <AuthModal 
        isOpen={isAuthModalOpen && !user}
        onClose={() => setIsAuthModalOpen(false)}
      />

      <main className={styles["sokodigi-main"]}> 
        {/* 
          🟢 COMBINED OUTLET CONTEXT:
          Shares database search arrays with MarketHub while exposing modal triggers 
          and search update managers directly to the premium HomePage visual frame.
        */}
        <Outlet 
          context={{
            searchResults: searchParams.q.trim().length >= 2 ? searchResults : [], 
            isSearching, 
            activeQuery: searchParams.q,
            onAuthClick: () => setIsAuthModalOpen(true),
            onSearchUpdate: handleSearchUpdate
          }} 
        /> 
      </main> 

      <Footer />
    </div> 
  ); 
}
