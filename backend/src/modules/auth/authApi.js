import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { auth } from "../firebase";

const API_URL = import.meta.env.PROD
  ? ""
  : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

const PENDING_KEY = "sokodigi_pending_marketer";

const FIREBASE_ERRORS = {
  "auth/email-already-in-use": "That email is already registered. Try signing in.",
  "auth/weak-password": "Use at least 8 characters, with a capital letter and a number.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes.",
  "auth/network-request-failed": "Network problem. Check your connection.",
  // One message for wrong email AND wrong password, so attackers can't tell which accounts exist
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/wrong-password": "Incorrect email or password.",
  "auth/user-not-found": "Incorrect email or password.",
  "auth/user-disabled": "This account has been disabled.",
};

const SERVER_ERRORS = {
  USERNAME_TAKEN: "That username is taken.",
  ACCOUNT_DETAILS_IN_USE: "That phone number is already linked to an account.",
  INVALID_SPONSOR: "That referral link is not valid.",
  EMAIL_NOT_VERIFIED: "Please verify your email first.",
  NETWORK_NOT_OPEN: "Marketer sign-up is not open yet.",
  PHONE_CHANGE_NOT_ALLOWED: "The phone number on this account cannot be changed here.",
  TOO_MANY_REQUESTS: "Too many attempts. Please wait a minute.",
};

export function friendlyError(e) {
  if (e?.code && FIREBASE_ERRORS[e.code]) return FIREBASE_ERRORS[e.code];
  if (e?.code && SERVER_ERRORS[e.code]) return SERVER_ERRORS[e.code];
  if (typeof e?.code === "string" && e.code.startsWith("REQUIRED_")) return "Please fill in all required fields.";
  if (e?.code === "VALIDATION_ERROR") return `Please check the ${e.field || "form"} field.`;
  return "Something went wrong. Please try again.";
}

// Idempotent: safe to call at signup AND at every login
export async function syncAccount(payload = {}) {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error("NOT_SIGNED_IN"), { code: "NOT_SIGNED_IN" });
  const token = await user.getIdToken();
  const res = await fetch(`${API_URL}/api/auth/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "SYNC_FAILED"), { code: data.error, field: data.field });
  return data; // { user, profile }
}

// ---- Buyer ----
export async function registerBuyer({ email, password, firstName, lastName, username, phoneNumber }) {
  await createUserWithEmailAndPassword(auth, email.trim(), password);
  await sendEmailVerification(auth.currentUser).catch(() => {}); // not fatal
  return syncAccount({ firstName, lastName, username, phoneNumber, accountCategory: "retail" });
}

// add to SERVER_ERRORS:
//   ALREADY_A_MARKETER: "This account is already a marketer account.",
//   REQUIRED_USERNAME: "Please choose a username.",
//   ACCOUNT_NOT_ELIGIBLE: "This account can't be upgraded right now.",

async function authedJson(path, method, payload) {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error("NOT_SIGNED_IN"), { code: "NOT_SIGNED_IN" });
  const token = await user.getIdToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "REQUEST_FAILED"), { code: data.error, field: data.field });
  return data;
}

export const patchProfile = (patch) => authedJson("/api/profiles/me", "PATCH", patch);
export const becomeMarketer = (payload) => authedJson("/api/auth/become-marketer", "POST", payload);

// Where to send someone after login or signup
export function destinationFor(user) {
  if (!user) return "home";
  if (user.accountCategory !== "network") return "home"; // buyer
  if (user.membershipStatus === "suspended") return "suspended";
  const lapsed = user.membershipExpiresAt && new Date(user.membershipExpiresAt) <= new Date();
  if (user.membershipStatus === "pending" || lapsed) return "membership"; // pay or renew
  return "dashboard"; // active marketer
}
// ---- Marketer, step 1: create the login and ask them to verify ----
// export async function startMarketerSignup({ email, password, ...profileFields }) {
//   await createUserWithEmailAndPassword(auth, email.trim(), password);
//   await sendEmailVerification(auth.currentUser);
//   // Everything except the password, kept only for this browser tab
//   sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...profileFields, accountCategory: "network" }));
//   return { needsVerification: true };
// }

export async function resendVerification() {
  if (!auth.currentUser) throw Object.assign(new Error("NOT_SIGNED_IN"), { code: "NOT_SIGNED_IN" });
  await sendEmailVerification(auth.currentUser);
}

// ---- Marketer, step 2: after they click the email link ----
// export async function finishMarketerSignup() {
//   const user = auth.currentUser;
//   if (!user) throw Object.assign(new Error("NOT_SIGNED_IN"), { code: "NOT_SIGNED_IN" });
//   await user.reload();
//   if (!user.emailVerified) throw Object.assign(new Error("EMAIL_NOT_VERIFIED"), { code: "EMAIL_NOT_VERIFIED" });
//   await user.getIdToken(true); // refresh so the token carries email_verified = true
//   const saved = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
//   if (!saved) throw Object.assign(new Error("SIGNUP_DETAILS_LOST"), { code: "SIGNUP_DETAILS_LOST" });
//   const result = await syncAccount(saved);
//   sessionStorage.removeItem(PENDING_KEY);
//   return result;
// }

// ---- Login / logout / reset ----
export async function login(email, password) {
  await signInWithEmailAndPassword(auth, email.trim(), password);
  return syncAccount({}); // creates the DB record if an earlier signup was cut off
}

export const logout = () => signOut(auth);

export async function requestPasswordReset(email) {
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (e) {
    if (e?.code === "auth/too-many-requests") throw e;
    // Any other error is swallowed on purpose, so the screen can't reveal which emails exist
  }
}
