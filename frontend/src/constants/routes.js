// src/constants/routes.js

const ROUTES = {
  /* Public */
  HOME: "/",
  MARKETPLACE: "/marketplace",
  PRODUCT_DETAILS: "/product-details/:id",
  PUBLIC_PROFILE: "/profile/:username",
  REGISTER: "/register",

  /* Any signed-in account */
  MY_PROFILE: "/profile",
  CHECKOUT: "/checkout",
  WALLET: "/wallet",
  MESSAGES: "/messages",
  NOTIFICATIONS: "/notifications",

  /* Retail users: marketer onboarding and shop access */
  BECOME_MARKETER: "/become-marketer",
  JOIN_SHOP: "/join-shop",

  /* Marketers */
  MEMBERSHIP: "/membership",
  MEMBER_DASHBOARD: "/dashboard",
  MY_TEAM: "/my-team",

  /* Admin */
  ADMIN_DASHBOARD: "/admin",

  /* Fallback */
  NOT_FOUND: "*",
};

export const productPath = (id) =>
  ROUTES.PRODUCT_DETAILS.replace(":id", encodeURIComponent(id));

export const profilePath = (username) =>
  ROUTES.PUBLIC_PROFILE.replace(
    ":username",
    encodeURIComponent(username)
  );

export const registerPath = (sponsorUsername) =>
  sponsorUsername
    ? `${ROUTES.REGISTER}?sponsor=${encodeURIComponent(sponsorUsername)}`
    : ROUTES.REGISTER;

export default ROUTES;
