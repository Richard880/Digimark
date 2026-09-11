import app from "./config";
import auth from "./auth";
import storage from "./storage";

if (typeof window !== "undefined") {
  window.__GLOBAL_FIREBASE_AUTH__ = auth;
}

export { app, auth, storage };
