import axios from "axios";
import { auth } from "../firebase";

const apiClient = axios.create({
  // If running on Vercel, it uses "/api". If running locally offline, it falls back to localhost.
  baseURL: process.env.NODE_ENV === "production" ? "/api" : "http://localhost:5000/api",
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
