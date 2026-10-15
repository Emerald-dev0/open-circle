import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { ANALYTICS_PAGES } from "@shared/analytics";

let pending: Promise<unknown> = Promise.resolve();

export function TrafficTracker() {
  const location = useLocation();
  const recorded = useRef<string | null>(null);
  useEffect(() => {
    if (!Object.prototype.hasOwnProperty.call(ANALYTICS_PAGES, location.pathname) || navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
    const key = `${location.key}:${location.pathname}`;
    if (recorded.current === key) return;
    recorded.current = key;
    let referrer = "";
    try { referrer = document.referrer ? new URL(document.referrer).origin : ""; } catch { referrer = ""; }
    const body = JSON.stringify({ page: location.pathname, referrer });
    pending = pending.catch(() => undefined).then(() => fetch("/api/analytics", {
      method: "POST", credentials: "same-origin", keepalive: true,
      headers: { "content-type": "application/json" }, body,
    })).catch(() => undefined);
  }, [location.key, location.pathname]);
  return null;
}
