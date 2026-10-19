// src/constants/routes.js
// Every page path lives here. Never type a path by hand elsewhere.

const ROUTES = {
  /* Public */
  HOME: "/",
  MARKETPLACE: "/marketplace",
  PRODUCT_DETAILS: "/product-details/:id",
  PUBLIC_PROFILE: "/profile/:username", // a marketer's shop page (matches the backend's username lookup)
  REGISTER: "/register",                // referral links: /register?sponsor=<username>

  /* Any signed-in account (buyers and marketers) */
  CHECKOUT: "/checkout",
  WALLET: "/wallet",
  MESSAGES: "/messages",
  NOTIFICATIONS: "/notifications",

  /* Marketers (active, paid members) */
  MEMBERSHIP: "/membership", // open to pending and lapsed marketers too: this is where they pay
  MEMBER_DASHBOARD: "/dashboard",
  MY_TEAM: "/my-team",

  /* Admin (screens not built yet) */
  ADMIN_DASHBOARD: "/admin",

  /* Fallback */
  NOT_FOUND: "*",
};

// Build real URLs from the patterns above. encodeURIComponent keeps odd characters from breaking a link.
export const productPath = (id) => ROUTES.PRODUCT_DETAILS.replace(":id", encodeURIComponent(id));
export const profilePath = (username) => ROUTES.PUBLIC_PROFILE.replace(":username", encodeURIComponent(username));
export const registerPath = (sponsorUsername) =>
  sponsorUsername ? `${ROUTES.REGISTER}?sponsor=${encodeURIComponent(sponsorUsername)}` : ROUTES.REGISTER;

export default ROUTES;
