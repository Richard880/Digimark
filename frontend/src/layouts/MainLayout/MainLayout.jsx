import { useState, useEffect, useMemo } from "react";
import { Outlet } from "react-router-dom";
import useAuth from "../../features/auth/hooks/useAuth";
import apiClient from "../../services/apiClient";
import Navbar from "../Navbar/Navbar";
import Footer from "../Footer/Footer";
import AuthModal from "../../features/auth/AuthModal";
import { captureReferral } from "../../utils/referral";
import styles from "./MainLayout.module.css";
import InstallPrompt from "../../pwa/InstallPrompt";
import PWAStatus from "../../pwa/PWAStatus";


export default function MainLayout() {
  const { auth, logout } = useAuth();

  // One plain object for the Navbar: the Firebase identity plus the database profile
  const unifiedUser = useMemo(() => {
    if (!auth.authenticated) return null;
    const fb = auth.currentUser;
    const p = auth.profile || {};
    return {
      ...p,
      uid: fb?.uid,
      email: fb?.email,
      displayName: p.displayName || fb?.displayName || "",
      profilePhoto: p.profilePhoto || "",
      photoURL: p.profilePhoto || fb?.photoURL || "",
      role: auth.role,
      accountCategory: auth.user?.accountCategory,
      membershipStatus: auth.user?.membershipStatus,
      destination: auth.destination,
      profile: p,
    };
  }, [auth.authenticated, auth.currentUser, auth.profile, auth.role, auth.user, auth.destination]);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchParams, setSearchParams] = useState({ q: "", type: "" });

  const handleSearchUpdate = (searchObj) => setSearchParams(searchObj);

  // Debounced search: waits 300 ms after typing stops and cancels the previous request
  useEffect(() => {
    const q = searchParams.q.trim();
    if (q.length < 2) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { data } = await apiClient.get("/search", {
         params: { q, type: "product" },
          signal: controller.signal,
        });
        setSearchResults(Array.isArray(data) ? data : data?.results || []);
      } catch (err) {
        if (err.code !== "ERR_CANCELED") {
          console.error("Search failed:", err);
          setSearchResults([]);
        }
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchParams]);

  useEffect(() => { captureReferral(); }, []);

  return (
    <div className={styles["sokodigi-app"]}>
      <Navbar
        user={unifiedUser}
        onLogout={logout}
        onAuthClick={() => setIsAuthModalOpen(true)}
        onSearchUpdate={handleSearchUpdate}
      />

      {/* Stays open until the database account exists, so registration isn't cut off */}
      <AuthModal isOpen={isAuthModalOpen && !auth.authenticated} onClose={() => setIsAuthModalOpen(false)} />

     <main className={`${styles["sokodigi-main"]} pb-20 lg:pb-0`}>
        <Outlet
          context={{
            searchResults: searchParams.q.trim().length >= 2 ? searchResults : [],
            isSearching,
            activeQuery: searchParams.q,
            onAuthClick: () => setIsAuthModalOpen(true),
            onSearchUpdate: handleSearchUpdate,
          }}
        />
      </main>

      <Footer />
     <InstallPrompt />
      <PWAStatus />
    </div>
  );
}
