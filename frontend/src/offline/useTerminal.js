import { useEffect, useState } from "react";
import apiClient from "../services/apiClient";
import { kvGet, kvSet } from "./db";

export default function useTerminal(uid, ent, branchId, online) {
  const need = !!(ent?.active && ent.features.multiTerminal);
  const [terminal, setTerminal] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!uid || !need || !branchId) return undefined;
    let live = true;
    kvGet(`terminal:${uid}`).then((c) => live && c && setTerminal(c)).catch(() => {});
    if (!online) return () => { live = false; };
    let deviceId = "";
    try { deviceId = localStorage.getItem("sokodigi_device_id") || ""; if (!deviceId) { deviceId = crypto.randomUUID().replace(/-/g, ""); localStorage.setItem("sokodigi_device_id", deviceId); } } catch { /* blocked storage */ }
    if (!deviceId) { setError("STORAGE_BLOCKED"); return () => { live = false; }; }
    apiClient.post("/shop/terminals/register", { deviceId, branchId })
      .then(({ data }) => { if (live) { setTerminal(data.terminal); setError(""); kvSet(`terminal:${uid}`, data.terminal).catch(() => {}); } })
      .catch((e) => live && setError(e.response?.data?.error || "NETWORK"));
    return () => { live = false; };
  }, [uid, need, branchId, online]);

  return { terminal, error, need };
}
