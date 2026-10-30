import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import AuthContext from "./AuthContext";
import { auth as firebaseAuth } from "../../../firebase";
import { getMe, login as apiLogin, logout as apiLogout, destinationFor } from "../authApi";
import { detachDevice } from "../../../pwa/push";

const EMPTY = {
  currentUser: null, user: null, profile: null, role: null, permissions: [],
  loading: false, authenticated: false, synced: false, loadError: null, destination: "home", referral: null,
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

// A trimmed copy of the last good profile, used only when the server can't be reached
const SNAP_TTL = 14 * 86400000;
const snapKey = (uid) => `sokodigi_auth_snap_${uid}`;
const saveSnap = (fb, data) => {
  try {
    if (!fb || !data?.synced || !data.user) return;
    const { phoneNumber, ...profile } = data.profile || {}; // never keep the payout phone on the device
    localStorage.setItem(snapKey(fb.uid), JSON.stringify({ at: Date.now(), data: { synced: true, user: data.user, profile, referral: data.referral || null } }));
  } catch { /* storage blocked or full: the snapshot is optional */ }
};
const loadSnap = (fb) => {
  try {
    const s = JSON.parse(localStorage.getItem(snapKey(fb.uid)) || "null");
    return s && Date.now() - s.at < SNAP_TTL ? s.data : null;
  } catch { return null; }
};
const dropSnap = (uid) => { try { if (uid) localStorage.removeItem(snapKey(uid)); } catch { /* ignore */ } };

function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ ...EMPTY, loading: true });
  const seq = useRef(0); // blocks race conditions from overlapping updates

  const hydrate = useCallback(async (fbUser, { reload = false } = {}) => {
    const mine = ++seq.current;
    try {
      if (reload) {
        await fbUser.reload();
        await fbUser.getIdToken(true);
      }
      const data = await getMe();
      if (mine === seq.current) { setAuth(build(fbUser, data)); saveSnap(fbUser, data); }
      return data;
    } catch (e) {
      if (mine !== seq.current) return null;

      if (e.status === 401 || e.code === "ACCOUNT_DISABLED") {
        dropSnap(fbUser?.uid);
        await apiLogout().catch(() => {});
        setAuth({ ...EMPTY });
        return null;
      }

      // No answer from the server (offline) or the server is down: use the saved copy so shops can keep selling
      const unreachable = !e.status || e.status >= 500;
      const snap = unreachable ? loadSnap(fbUser) : null;
      if (snap) {
        console.warn("Server unreachable: using the saved profile.");
        setAuth({ ...build(fbUser, snap), loadError: "OFFLINE_SNAPSHOT" });
      } else {
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
      await hydrate(fbUser).catch((err) => console.error("AuthState hydration failure:", err));
    });
    return () => unsubscribe();
  }, [hydrate]);

  // When the connection comes back, replace the saved copy with the real profile
  useEffect(() => {
    if (auth.loadError !== "OFFLINE_SNAPSHOT") return undefined;
    const retry = () => { if (firebaseAuth.currentUser) hydrate(firebaseAuth.currentUser); };
    window.addEventListener("online", retry);
    const t = setInterval(() => navigator.onLine && retry(), 30000);
    return () => { window.removeEventListener("online", retry); clearInterval(t); };
  }, [auth.loadError, hydrate]);

  const login = useCallback(async (credentialsOrEmail, optionalPassword) => {
    const creds = typeof credentialsOrEmail === "object"
      ? credentialsOrEmail
      : { email: credentialsOrEmail, password: optionalPassword };

    const data = await apiLogin(creds.email, creds.password, !!creds.rememberMe);
    ++seq.current;
    setAuth(build(firebaseAuth.currentUser, data));
    saveSnap(firebaseAuth.currentUser, data);
    return { user: data.user, destination: destinationFor(data.user) };
  }, []);

  const logout = useCallback(async () => {
    ++seq.current;
    const uid = firebaseAuth.currentUser?.uid;
    await detachDevice().catch((err) => console.warn("Push token cleanup skipped:", err));
    try { sessionStorage.removeItem("sokodigi_push_synced"); } catch { /* restrictive mobile sandboxes */ }
    dropSnap(uid);
    await apiLogout();
    setAuth({ ...EMPTY });
  }, []);

  const refreshProfile = useCallback(async (forceReloadOption) => {
    const fb = firebaseAuth.currentUser;
    if (!fb) return null;
    const shouldReload = forceReloadOption === true || (typeof forceReloadOption === "object" && forceReloadOption?.reload);
    const data = await hydrate(fb, { reload: !!shouldReload });
    return data?.profile ?? null;
  }, [hydrate]);

  const value = useMemo(() => ({ auth, login, logout, refreshProfile }), [auth, login, logout, refreshProfile]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
