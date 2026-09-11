
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

  /**
   * Retrieves the application profile associated
   * with the Firebase authenticated user.
   */
  const fetchProfileData = useCallback(
    async (uid, reloadFirebase = false) => {
      if (!uid) {
        return null;
      }

      if (reloadFirebase && authService.getCurrentUser()) {
        await authService.reloadCurrentUser();
      }

      const firebaseUser = authService.getCurrentUser();

      if (firebaseUser?.emailVerified && reloadFirebase) {
        await authService.updateEmailVerificationStatus(uid);
      }

      return authService.getUserProfile(uid);
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
   *
   * Firebase remains the source of truth for identity.
   * The application profile is loaded after Firebase
   * confirms the authenticated user.
   */
  useEffect(() => {
    if (initListenerRegistered.current) {
      return undefined;
    }

    initListenerRegistered.current = true;

    const unsubscribe = authService.onAuthStateChanged(
      async (firebaseUser) => {
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
      const firebaseUser =
        await authService.register(userData);

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
