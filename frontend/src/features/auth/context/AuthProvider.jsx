import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import AuthContext from "./AuthContext";
import { auth as firebaseAuth } from "../../../firebase";
import { getMe, login as apiLogin, logout as apiLogout, destinationFor } from "../authApi";

const EMPTY = {
  currentUser: null, // the Firebase user (use .getIdToken())
  user: null,        // database user: accountCategory, membershipStatus, role...
  profile: null,     // database profile: username, brandName, profilePhoto...
  role: null,
  permissions: [],
  loading: false,
  authenticated: false, // true only when the Firebase login AND the database account both exist
  synced: false,
  loadError: null,      // set when the server was unreachable (the user stays signed in)
  destination: "home",  // "home" | "membership" | "dashboard" | "suspended"
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
});

function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ ...EMPTY, loading: true });
  const seq = useRef(0); // only the newest request may update the state

  const hydrate = useCallback(async (fbUser, { reload = false } = {}) => {
    const mine = ++seq.current;
    try {
      if (reload) {
        await fbUser.reload();
        await fbUser.getIdToken(true); // so the token carries email_verified = true
      }
      const data = await getMe();
      if (mine === seq.current) setAuth(build(fbUser, data));
      return data;
    } catch (e) {
      if (mine !== seq.current) return null;
      if (e.status === 401 || e.code === "ACCOUNT_DISABLED") {
        await apiLogout().catch(() => {}); // a real auth failure: sign out
        setAuth({ ...EMPTY });
      } else {
        // Server or network problem: stay signed in, show a retry state, never log the user out
        console.error("Profile load failed:", e);
        setAuth({ ...EMPTY, currentUser: fbUser, loadError: "PROFILE_LOAD_FAILED" });
      }
      return null;
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth, (fbUser) => {
      if (!fbUser) {
        ++seq.current;
        setAuth({ ...EMPTY });
        return;
      }
      hydrate(fbUser); // read-only lookup: during signup it simply reports synced:false until sync finishes
    });
  }, [hydrate]);

  // login(email, password) or login({ email, password })
const login = useCallback(async (a, b) => {
  const creds = typeof a === "object" ? a : { email: a, password: b };
  const data = await apiLogin(creds.email, creds.password, !!creds.rememberMe);
  ++seq.current; // anything still loading is now stale
  setAuth(build(firebaseAuth.currentUser, data));
  return { user: data.user, destination: destinationFor(data.user) };
}, []);

  const logout = useCallback(async () => {
    ++seq.current;
    await apiLogout();
    setAuth({ ...EMPTY });
  }, []);

  // refreshProfile(true) also reloads Firebase (after the user verifies their email)
  const refreshProfile = useCallback(
    async (a, b) => {
      const fb = firebaseAuth.currentUser;
      if (!fb) return null;
      const data = await hydrate(fb, { reload: a === true || b === true });
      return data?.profile ?? null;
    },
    [hydrate]
  );

  const value = useMemo(() => ({ auth, login, logout, refreshProfile }), [auth, login, logout, refreshProfile]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
