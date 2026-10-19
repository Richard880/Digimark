import authService from "./services/authService";
import AuthError from "./utils/AuthError";

export const syncAccount = (payload = {}) => authService.syncApplicationUser(payload);
export const getMe = () => authService.getMe();
export const patchProfile = (patch) => authService.patchProfile(patch);
export const becomeMarketer = (payload) => authService.becomeMarketer(payload);
export const login = (email, password, rememberMe = false) => authService.login({ email, password, rememberMe });
export const logout = () => authService.logout();
export const resendVerification = () => authService.resendVerification();
export const requestPasswordReset = (email) => authService.resetPassword(email);

const SERVER_ERRORS = {
  USERNAME_TAKEN: "That username is taken.",
  ACCOUNT_DETAILS_IN_USE: "That phone number is already linked to an account.",
  INVALID_SPONSOR: "That referral link is not valid.",
  EMAIL_NOT_VERIFIED: "Please verify your email first.",
  NETWORK_NOT_OPEN: "Marketer sign-up is not open yet.",
  PHONE_CHANGE_NOT_ALLOWED: "The phone number on this account cannot be changed here.",
  ALREADY_A_MARKETER: "This account is already a marketer account.",
  REQUIRED_USERNAME: "Please choose a username.",
  ACCOUNT_NOT_ELIGIBLE: "This account can't be upgraded right now.",
  ACCOUNT_DISABLED: "This account has been disabled.",
  TOO_MANY_REQUESTS: "Too many attempts. Please wait a minute.",
  NETWORK_ERROR: "Couldn't reach Sokodigi. Check your connection and try again.",
};

export function friendlyError(e) {
  if (e instanceof AuthError) return e.message; // already a friendly Firebase message
  if (e?.code && SERVER_ERRORS[e.code]) return SERVER_ERRORS[e.code];
  if (typeof e?.code === "string" && e.code.startsWith("REQUIRED_")) return "Please fill in all required fields.";
  if (e?.code === "VALIDATION_ERROR") return `Please check the ${e.field || "form"} field.`;
  return "Something went wrong. Please try again.";
}

// Where to send someone after login or signup
export function destinationFor(user) {
  if (!user) return "home";
  if (user.accountCategory !== "network") return "home"; // buyer
  if (user.membershipStatus === "suspended") return "suspended";
  const lapsed = user.membershipExpiresAt && new Date(user.membershipExpiresAt) <= new Date();
  if (user.membershipStatus === "pending" || lapsed) return "membership"; // pay or renew
  return "dashboard"; // active marketer
}
