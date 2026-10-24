import { useCallback, useEffect, useState } from "react";
import { pushSupported, currentSubscription, enablePush, disablePush, sendTestPush } from "./push";
import { isIOS, isStandalone } from "./usePWA";

const ERRORS = {
  DENIED: "Alerts are blocked for this site. Allow notifications in your browser's site settings, then try again.",
  UNSUPPORTED: "This browser can't show alerts from websites.",
  PUSH_NOT_CONFIGURED: "Alerts aren't available yet. Please check back soon.",
  TIMEOUT: "That took too long. Check your connection and try again.",
  NO_DEVICE_REACHED: "We couldn't reach this device. Try turning alerts off and on again.",
};

export function usePush() {
  const needsInstall = isIOS() && !isStandalone(); // iPhone only allows alerts for apps on the Home Screen
  const supported = pushSupported();
  const [permission, setPermission] = useState(() => (supported ? Notification.permission : "unsupported"));
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!supported) return;
    setPermission(Notification.permission);
    setSubscribed(Notification.permission === "granted" && !!(await currentSubscription()));
  }, [supported]);

  useEffect(() => { refresh(); }, [refresh]);

  const wrap = async (fn) => {
    setBusy(true); setError("");
    try { await fn(); }
    catch (e) { setError(ERRORS[e.code] || ERRORS[e.response?.data?.error] || "Something went wrong. Please try again."); }
    finally { setBusy(false); await refresh(); }
  };

  return {
    supported, needsInstall, permission, subscribed, busy, error,
    enable: () => wrap(enablePush),
    disable: () => wrap(disablePush),
    test: () => wrap(sendTestPush),
  };
}
