import { useCallback, useEffect, useRef, useState } from "react";
import apiClient from "../../services/apiClient";
import { generateIdentity, importPrivate, makeBackup, restoreFromBackup, saveIdentity, loadIdentity } from "./chatCrypto";

// status: loading | setup (first time) | restore (new device or cleared browser) | reset | ready | error
export default function useChatIdentity(userId) {
  const [status, setStatus] = useState("loading");
  const [identity, setIdentity] = useState(null);
  const serverRef = useRef(null);

  const init = useCallback(async () => {
    if (!userId) return;
    setStatus("loading");
    try {
      const { data } = await apiClient.get("/chats/keys/me");
      serverRef.current = data;
      if (!data.exists) return setStatus("setup");
      const local = await loadIdentity(userId);
      if (local && local.version === data.current && local.publicKey === data.publicKey) {
        setIdentity(local);
        setStatus("ready");
      } else {
        setStatus("restore"); // missing, or out of date because keys were reset on another device
      }
    } catch (e) {
      console.error("Chat keys load failed:", e);
      setStatus("error");
    }
  }, [userId]);

  useEffect(() => { init(); }, [init]);

  const create = async (passphrase, path) => {
    const { publicKey, pkcs8 } = await generateIdentity();
    const backup = await makeBackup(pkcs8, passphrase);
    const { data } = await apiClient[path === "/chats/keys" ? "put" : "post"](path, { publicKey, backup });
    const id = { privateKey: await importPrivate(pkcs8), publicKey, version: data.version };
    await saveIdentity(userId, id);
    setIdentity(id);
    setStatus("ready");
  };

  const restore = async (passphrase) => {
    const s = serverRef.current;
    const privateKey = await restoreFromBackup(s.backup, passphrase); // throws WRONG_PASSPHRASE
    const id = { privateKey, publicKey: s.publicKey, version: s.current };
    await saveIdentity(userId, id);
    setIdentity(id);
    setStatus("ready");
  };

  return {
    status, identity, retry: init,
    setup: (p) => create(p, "/chats/keys"),
    reset: (p) => create(p, "/chats/keys/reset"),
    restore,
    startReset: () => setStatus("reset"),
  };
}
