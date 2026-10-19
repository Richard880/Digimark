const BAD_LOGIN = "Incorrect email or password.";

const AUTH_ERROR_MESSAGES = {
  // These three MUST stay identical, so nobody can tell which emails have accounts
  "auth/invalid-credential": BAD_LOGIN,
  "auth/user-not-found": BAD_LOGIN,
  "auth/wrong-password": BAD_LOGIN,
  "auth/missing-password": "Please enter your password.",

  "auth/email-already-in-use": "An account with this email address already exists.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/weak-password": "Use at least 8 characters, with a capital letter and a number.",
  "auth/network-request-failed": "Unable to connect. Please check your internet connection.",
  "auth/too-many-requests": "Too many unsuccessful attempts. Please try again later.",
  "auth/user-disabled": "This account has been disabled. Please contact support.",
  "auth/requires-recent-login": "For your security, please sign in again to continue.",
  "auth/operation-not-allowed": "This sign-in method is not available right now.",
  "auth/internal-error": "Something went wrong on our side. Please try again.",

  default: "An unexpected error occurred. Please try again.",
};

export function getAuthErrorMessage(code) {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(AUTH_ERROR_MESSAGES, code)
    ? AUTH_ERROR_MESSAGES[code]
    : AUTH_ERROR_MESSAGES.default;
}

export default AUTH_ERROR_MESSAGES;
