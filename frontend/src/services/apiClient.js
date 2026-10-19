import axios from "axios";
import { auth } from "../firebase";

// Same rule as the other files: same-origin "/api" in production, VITE_API_URL (or localhost) in development
const ORIGIN = import.meta.env.PROD
  ? ""
  : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const BASE_URL = `${ORIGIN}/api`;

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

// Is this request going to OUR API? (relative URLs always are)
function isOurApi(config) {
  const url = config.url || "";
  if (!/^[a-z][a-z\d+.-]*:/i.test(url) && !url.startsWith("//")) return true; // relative path
  return url.startsWith(BASE_URL);
}

apiClient.interceptors.request.use(async (config) => {
  // Never send the login token anywhere except our own API
  if (!isOurApi(config)) return config;

  const user = auth.currentUser;
  if (user && !config.headers.Authorization) {
    try {
      config.headers.Authorization = `Bearer ${await user.getIdToken()}`;
    } catch (e) {
      // No token: send the request anyway. The server will answer 401 and the app handles it.
      console.error("Could not get a login token:", e?.code);
    }
  }
  return config;
});

// Deliberately NO 401 interceptor that signs the user out or redirects.
// AuthProvider decides when to log out: a failed request alone must not.

export default apiClient;
