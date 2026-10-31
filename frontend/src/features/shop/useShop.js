import { useCallback, useEffect, useState } from "react";
import apiClient from "../../services/apiClient";
import useAuth from "../auth/hooks/useAuth";

const key = (uid) => `sokodigi_shop_snap_${uid}`;

export default function useShop() {
  const { auth } = useAuth();
  const uid = auth.user?._id ? String(auth.user._id) : "";
  const [shop, setShop] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | none | error

  const refresh = useCallback(async () => {
    if (!uid) return;
    try {
      const { data } = await apiClient.get("/shop/me");
      setShop(data); setState("ready");
      try { localStorage.setItem(key(uid), JSON.stringify({ data })); } catch { /* optional */ }
    } catch (e) {
      if (e.response?.status === 401 || e.response?.status === 403) {
        setShop(null); setState("none");
        try { localStorage.removeItem(key(uid)); localStorage.removeItem("sokodigi_staff"); } catch { /* ignore */ }
        return;
      }
      try { const s = JSON.parse(localStorage.getItem(key(uid)) || "null"); if (s?.data) { setShop(s.data); setState("ready"); return; } } catch { /* ignore */ }
      setState("error"); // offline with no saved copy
    }
  }, [uid]);
  useEffect(() => { refresh(); }, [refresh]);

  const can = (p) => !!shop && (shop.perms.includes("*") || shop.perms.includes(p));
  return { shop, ent: shop?.ent || null, state, loading: state === "loading", can, refresh };
}
