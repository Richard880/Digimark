import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  reload,
} from "firebase/auth";

import { auth } from "../../../firebase";
import apiClient from "../../../services/apiClient";
import AuthError from "../utils/AuthError";
import { getAuthErrorMessage } from "../utils/authErrorMessages";

const mapFirebaseError = (error) => {
  console.error("Firebase authentication error:", error);
  throw new AuthError(getAuthErrorMessage(error.code), error.code);
};

const authService = {
  get authInstance() {
    return auth;
  },

  async login({ email, password, rememberMe = false }) {
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      const credential = await signInWithEmailAndPassword(auth, email, password);
      await this.syncApplicationUser();
      return credential.user;
    } catch (error) {
      if (error?.code?.startsWith("auth/")) mapFirebaseError(error);
      throw error;
    }
  },

  async register({ firstName, lastName, email, phoneNumber, password, sponsorId, username, brandName }) {
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const user = credential.user;
      const displayName = `${firstName} ${lastName}`.trim();

      await updateProfile(user, { displayName });
      await this.syncApplicationUser({ firstName, lastName, phoneNumber, sponsorUserId: sponsorId, username, brandName, accountType: "member" });
      await sendEmailVerification(user);
      return user;
    } catch (error) {
      if (error?.code?.startsWith("auth/")) mapFirebaseError(error);
      throw error;
    }
  },

  async getIdToken(forceRefresh = false) {
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken(forceRefresh);
  },

  async syncApplicationUser(payload = {}) {
    const user = auth.currentUser;
    if (!user) throw new Error("AUTHENTICATED_USER_REQUIRED");
    const token = await user.getIdToken();
    const response = await apiClient.post("/auth/sync", payload, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  },

  async getUserProfile() {
    const token = await this.getIdToken();
    if (!token) return null;
    const response = await apiClient.get("/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const user = response.data.user || {};
    const profile = response.data.profile || {};
    return {
      ...profile,
      id: user._id,
      firebaseUid: user.firebaseUid,
      role: user.role,
      accountType: user.accountType,
      membershipStatus: user.membershipStatus,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
    };
  },

  async updateEmailVerificationStatus() {
    const user = auth.currentUser;
    if (!user) return false;
    await reload(user);
    if (!user.emailVerified) return false;
    await this.syncApplicationUser();
    return true;
  },

  async reloadCurrentUser() {
    const user = auth.currentUser;
    if (!user) return null;
    await reload(user);
    return user;
  },

  async logout() {
    try {
      await signOut(auth);
    } catch (error) {
      mapFirebaseError(error);
    }
  },

  async resetPassword(email) {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      mapFirebaseError(error);
    }
  },

  getCurrentUser() {
    return auth.currentUser;
  },

  isReady() {
    return Boolean(auth.currentUser);
  },

  onAuthStateChanged(callback) {
    return onAuthStateChanged(auth, callback);
  },
};

export default authService;
