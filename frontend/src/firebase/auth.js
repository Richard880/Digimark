import { getAuth } from "firebase/auth";
import app from "./config";

// Instantiate EXACTLY once
const auth = getAuth(app);

export default auth;