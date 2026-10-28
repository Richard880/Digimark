import { useCallback, useEffect, useState } from "react";
import apiClient from "../../services/apiClient";

export default function useEntitlements() {
  const [ent, setEnt] = useState(null);
  const refresh = useCallback(async () => {
    try { setEnt((await apiClient.get("/membership/entitlements")).data); } catch { /* the page still works without it */ }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { ent, refresh };
}
