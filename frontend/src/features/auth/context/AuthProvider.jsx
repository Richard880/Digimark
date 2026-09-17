import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import AuthContext from "./AuthContext";
import authService from "../services/authService";

function AuthProvider({ children }) {
  const [auth, setAuth] = useState({
    currentUser: null,
    profile: null,
    role: null,
    permissions: [],
    loading: true,
    authenticated: false,
  });

  const initListenerRegistered = useRef(false);
  // 🎯 THE FIX: Track registration state to prevent the global background listener from jumping the gun
  const isRegistering = useRef(false);

  /**
   * Retrieves the application profile associated
   * with the Firebase authenticated user.
   */
const fetchProfileData = useCallback(
  async (uid, reloadFirebase = false) => {
    if (!uid) return null;

    // 🎯 THE FIX: Get the current authenticated user instance safely
    const firebaseUser = authService.getCurrentUser();
    if (!firebaseUser) return null;

    try {
      // Force wait for a valid ID token before doing any network transactions
      const token = await firebaseUser.getIdToken();
      if (!token) {
        console.warn("Delaying profile fetch: Firebase token is still initializing.");
        return null;
      }

      if (firebaseUser.emailVerified && reloadFirebase) {
        await authService.updateEmailVerificationStatus(uid);
      }

      return authService.getUserProfile(uid);
    } catch (err) {
      console.error("Profile lookup skipped due to uninitialized session state:", err);
      return null;
    }
  },
  []
);


  /**
   * Refresh the currently authenticated user's
   * application profile.
   */
  const refreshProfile = useCallback(
    async (uid, reloadFirebase = false) => {
      const profile = await fetchProfileData(
        uid,
        reloadFirebase
      );

      setAuth((previous) => ({
        ...previous,
        profile,
        role: profile?.role ?? null,
        permissions: profile?.permissions ?? [],
      }));

      return profile;
    },
    [fetchProfileData]
  );

  /**
   * Firebase authentication state listener.
   */
  useEffect(() => {
    if (initListenerRegistered.current) {
      return undefined;
    }

    initListenerRegistered.current = true;

    const unsubscribe = authService.onAuthStateChanged(
      async (firebaseUser) => {
        // 🎯 THE FIX: If registration is explicitly running, let the register function
        // handle updating the state object with the profile once the sync route completes successfully.
        if (isRegistering.current) {
          console.log("Observer bypassed: registration synchronization flow in control.");
          return;
        }

        try {
          if (!firebaseUser) {
            setAuth({
              currentUser: null,
              profile: null,
              role: null,
              permissions: [],
              loading: false,
              authenticated: false,
            });

            return;
          }

          const profile = await fetchProfileData(
            firebaseUser.uid
          );

          setAuth({
            currentUser: firebaseUser,
            profile: profile || null,
            role: profile?.role ?? null,
            permissions: profile?.permissions ?? [],
            loading: false,
            authenticated: true,
          });
        } catch (error) {
          console.error(
            "Authentication profile synchronization failed:",
            error
          );

          setAuth({
            currentUser: null,
            profile: null,
            role: null,
            permissions: [],
            loading: false,
            authenticated: false,
          });
        }
      }
    );

    return () => {
      unsubscribe();
      initListenerRegistered.current = false;
    };
  }, [fetchProfileData]);

  /**
   * Login through the authentication service.
   */
  const login = useCallback(
    async (credentials) => {
      const firebaseUser =
        await authService.login(credentials);

      const profile = await fetchProfileData(
        firebaseUser.uid
      );

      setAuth({
        currentUser: firebaseUser,
        profile: profile || null,
        role: profile?.role ?? null,
        permissions: profile?.permissions ?? [],
        loading: false,
        authenticated: true,
      });

      return firebaseUser;
    },
    [fetchProfileData]
  );

  /**
   * Register a new user through the authentication service.
   */
  const register = useCallback(
    async (userData) => {
      try {
        // 🎯 THE FIX: Lock down the automatic background state loader loop
        isRegistering.current = true;

        // 1. Run Firebase user generation and await internal database synchronization
        const firebaseUser = await authService.register(userData);

        // 2. Fetch the newly compiled user profile now that synchronization is complete
        const profile = await fetchProfileData(firebaseUser.uid);

        setAuth({
          currentUser: firebaseUser,
          profile: profile || null,
          role: profile?.role ?? null,
          permissions: profile?.permissions ?? [],
          loading: false,
          authenticated: true,
        });

        return firebaseUser;
      } catch (error) {
        console.error("Form level registration failed:", error);
        throw error;
      } finally {
        // 🎯 THE FIX: Unlock the background state loader once done
        isRegistering.current = false;
      }
    },
    [fetchProfileData]
  );

  /**
   * Logout and clear application authentication state.
   */
  const logout = useCallback(async () => {
    await authService.logout();

    setAuth({
      currentUser: null,
      profile: null,
      role: null,
      permissions: [],
      loading: false,
      authenticated: false,
    });
  }, []);

  const value = useMemo(
    () => ({
      auth,
      login,
      register,
      logout,
      refreshProfile,
    }),
    [
      auth,
      login,
      register,
      logout,
      refreshProfile,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthProvider;
