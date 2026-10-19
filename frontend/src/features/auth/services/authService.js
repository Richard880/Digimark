import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
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
  console.error("Firebase authentication error:", error?.code); // the code only, never the whole error
  throw new AuthError(getAuthErrorMessage(error.code), error.code);
};

// Authenticated API call: always sends a fresh token, and turns every failure into { code, field, status }
async function call(method, url, data) {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error("NOT_SIGNED_IN"), { code: "NOT_SIGNED_IN" });
  const token = await user.getIdToken();
  try {
    const res = await apiClient.request({ method, url, data, headers: { Authorization: `Bearer ${token}` } });
    return res.data;
  } catch (e) {
    const status = e.response?.status;
    const body = e.response?.data || {};
    throw Object.assign(new Error(body.error || "REQUEST_FAILED"), {
      code: body.error || (status ? "REQUEST_FAILED" : "NETWORK_ERROR"),
      field: body.field,
      status, // undefined means the server could not be reached
    });
  }
}

const authService = {
  get authInstance() {
    return auth;
  },

  async login({ email, password, rememberMe = false }) {
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      if (error?.code?.startsWith("auth/")) mapFirebaseError(error);
      throw error;
    }
    await this.syncApplicationUser({}); // idempotent: repairs an account whose signup was cut off
    return this.getMe(); // { synced: true, user, profile }
  },

  async logout() {
    try {
      await signOut(auth);
    } catch (error) {
      mapFirebaseError(error);
    }
  },

  async getIdToken(forceRefresh = false) {
    const user = auth.currentUser;
    return user ? user.getIdToken(forceRefresh) : null;
  },

  // ---- Application API (all of these go through call()) ----
  syncApplicationUser: (payload = {}) => call("post", "/auth/sync", payload),
  patchProfile: (patch) => call("patch", "/profiles/me", patch),
  becomeMarketer: (payload) => call("post", "/auth/become-marketer", payload),

  // Read-only lookup: never creates anything
  async getMe() {
    if (!auth.currentUser) return { synced: false };
    return call("get", "/auth/me");
  },

  // ---- Email verification ----
  async resendVerification() {
    const user = auth.currentUser;
    if (!user) throw Object.assign(new Error("NOT_SIGNED_IN"), { code: "NOT_SIGNED_IN" });
    try {
      await sendEmailVerification(user);
    } catch (error) {
      if (error?.code?.startsWith("auth/")) mapFirebaseError(error);
      throw error;
    }
  },

  async updateEmailVerificationStatus() {
    const user = auth.currentUser;
    if (!user) return false;
    await reload(user);
    if (user.emailVerified) await user.getIdToken(true); // so the token carries email_verified = true
    return user.emailVerified;
  },

  async reloadCurrentUser() {
    const user = auth.currentUser;
    if (!user) return null;
    await reload(user);
    return user;
  },

  // Same screen message whether or not the email has an account
  async resetPassword(email) {
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (error) {
      if (error?.code === "auth/too-many-requests" || error?.code === "auth/network-request-failed") {
        mapFirebaseError(error);
      }
      // anything else is swallowed on purpose
    }
  },

  getCurrentUser: () => auth.currentUser,
  isReady: () => Boolean(auth.currentUser),
  onAuthStateChanged: (callback) => onAuthStateChanged(auth, callback),
};

export default authService;
