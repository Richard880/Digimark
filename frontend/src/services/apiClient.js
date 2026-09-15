import axios from "axios";
import { auth } from "../firebase";

const apiClient = axios.create({
  // Dynamically uses /api in production (from your .env.production)
  // and falls back to localhost during local test workflows
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    // Dynamically fetches the latest valid session token from Firebase
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default apiClient;
