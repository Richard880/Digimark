import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import AuthContext from "./AuthContext";
import { auth as firebaseAuth } from "../../../firebase";
import { getMe, login as apiLogin, logout as apiLogout, destinationFor } from "../authApi";
import { detachDevice } from "../../../pwa/push";

const EMPTY = {
  currentUser: null,     // The Firebase user object (call .getIdToken())
  user: null,            // Database user account details (category, status, role)
  profile: null,         // Database user profile (username, brand name, avatar image)
  role: null,
  permissions: [],
  loading: false,
  authenticated: false,  // True only when both Firebase and internal database synchronization match
  synced: false,
  loadError: null,       // Network/Unreachable server fallback flag (maintains active login)
  destination: "home",   // Routing targets: "home" | "membership" | "dashboard" | "suspended"
  referral: null,
};

const build = (currentUser, data) => ({
  currentUser,
  user: data.user || null,
  profile: data.profile || null,
  role: data.user?.role ?? null,
  permissions: data.user?.permissions ?? [],
  loading: false,
  authenticated: !!data.synced,
  synced: !!data.synced,
  loadError: null,
  destination: destinationFor(data.user),
  referral: data.referral || null,
});

function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ ...EMPTY, loading: true });
  const seq = useRef(0); // Sequence lock: blocks race conditions from overlapping updates

  const hydrate = useCallback(async (fbUser, { reload = false } = {}) => {
    const mine = ++seq.current;
    try {
      if (reload) {
        await fbUser.reload();
        await fbUser.getIdToken(true); // Refreshes token claims immediately (e.g. email_verified)
      }
      const data = await getMe();
      if (mine === seq.current) setAuth(build(fbUser, data));
      return data;
    } catch (e) {
      if (mine !== seq.current) return null;
      
      if (e.status === 401 || e.code === "ACCOUNT_DISABLED") {
        await apiLogout().catch(() => {}); // Graceful exit on structural authorization failure
        setAuth({ ...EMPTY });
      } else {
        // Safe Fallback: Keeps user signed into Firebase but flags network connectivity errors
        console.error("Profile synchronization fallback triggered:", e);
        setAuth({ ...EMPTY, currentUser: fbUser, loadError: "PROFILE_LOAD_FAILED" });
      }
      return null;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (fbUser) => {
      if (!fbUser) {
        ++seq.current;
        setAuth({ ...EMPTY });
        return;
      }
      // 🟢 Fix: Execute inside your sequential tracking scope safely
      await hydrate(fbUser).catch((err) => console.error("AuthState hydration failure:", err));
    });

    return () => unsubscribe();
  }, [hydrate]);

  // Supports legacy destructured calls: login(email, password) or login({ email, password })
  const login = useCallback(async (credentialsOrEmail, optionalPassword) => {
    const creds = typeof credentialsOrEmail === "object" 
      ? credentialsOrEmail 
      : { email: credentialsOrEmail, password: optionalPassword };

    const data = await apiLogin(creds.email, creds.password, !!creds.rememberMe);
    ++seq.current; // Immediately deprecate any resolving profile hydrations
    setAuth(build(firebaseAuth.currentUser, data));
    return { user: data.user, destination: destinationFor(data.user) };
  }, []);

  const logout = useCallback(async () => {
    ++seq.current; // Cancel pending actions
    
    // Disconnect device tokens from push notifications before authorization breaks
    await detachDevice().catch((err) => console.warn("Push token cleanup skipped:", err));
    
    try { 
      sessionStorage.removeItem("sokodigi_push_synced"); 
    } catch (e) {
      /* Safe isolation for restrictive mobile sandbox environments */ 
    }
    
    await apiLogout();
    setAuth({ ...EMPTY });
  }, []);

  // Force refreshes local context fields (useful for post-email verification workflows)
  const refreshProfile = useCallback(async (forceReloadOption) => {
    const fb = firebaseAuth.currentUser;
    if (!fb) return null;
    
    const shouldReload = forceReloadOption === true || (typeof forceReloadOption === "object" && forceReloadOption?.reload);
    const data = await hydrate(fb, { reload: !!shouldReload });
    return data?.profile ?? null;
  }, [hydrate]);

  const value = useMemo(() => ({ 
    auth, 
    login, 
    logout, 
    refreshProfile 
  }), [auth, login, logout, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
