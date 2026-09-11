const AUTH_ERROR_MESSAGES = {
  "auth/invalid-credential":
    "The email address or password you entered is incorrect.",

  "auth/user-not-found":
    "No account was found with that email address.",

  "auth/wrong-password":
    "The email address or password you entered is incorrect.",

  "auth/email-already-in-use":
    "An account with this email address already exists.",

  "auth/invalid-email":
    "Please enter a valid email address.",

  "auth/weak-password":
    "Your password is too weak. Please choose a stronger password.",

  "auth/network-request-failed":
    "Unable to connect. Please check your internet connection.",

  "auth/too-many-requests":
    "Too many unsuccessful attempts. Please try again later.",

  "auth/user-disabled":
    "This account has been disabled. Please contact support.",

  default:
    "An unexpected error occurred. Please try again.",
};

export function getAuthErrorMessage(code) {
  return AUTH_ERROR_MESSAGES[code] || AUTH_ERROR_MESSAGES.default;
}

export default AUTH_ERROR_MESSAGES;