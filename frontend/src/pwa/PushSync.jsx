import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../features/auth/hooks/useAuth";
import { syncPush } from "./push";

export default function PushSync() {
  const { auth } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { if (auth.authenticated) syncPush(); }, [auth.authenticated]);

  // The service worker asks the open app to go to the page the alert was about
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const onMessage = (e) => {
      const d = e.data;
      if (d?.type === "sokodigi-navigate" && typeof d.url === "string" && d.url.startsWith("/") && !d.url.startsWith("//")) navigate(d.url);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);

  return null;
}
