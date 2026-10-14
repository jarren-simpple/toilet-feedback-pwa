import { useEffect, useState } from "react";
import { runWithTimeout } from "./timeout";

export type ConnectionStatus = "checking" | "online" | "slow" | "offline";

const FALLBACK_PING_PATH = "/favicon.svg";
const PING_TIMEOUT_MS = 8000;
/** A round-trip slower than this still works but feedback may take a while to send. */
const SLOW_PING_MS = 2500;
const DEFAULT_PING_INTERVAL_MS = 20_000;

/**
 * Pings the API host so the dot reflects what actually matters (can feedback reach the backend?)
 * rather than the static host serving the app. `no-cors` keeps this a plain reachability check:
 * any HTTP answer (even a 404 or CORS-less response) resolves; only a network failure rejects.
 * `navigator.onLine` alone only reflects the OS network adapter and can read true with no real
 * connectivity.
 */
async function pingOnce(pingUrl: string | undefined): Promise<ConnectionStatus> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "offline";
  }
  if (typeof fetch === "undefined") {
    return "online";
  }

  const startedAt = Date.now();
  try {
    await runWithTimeout(PING_TIMEOUT_MS, async (signal) => {
      const separator = (pingUrl ?? FALLBACK_PING_PATH).includes("?") ? "&" : "?";
      const target = `${pingUrl ?? FALLBACK_PING_PATH}${separator}ping=${Date.now()}`;
      const response = await fetch(target, {
        method: "HEAD",
        cache: "no-store",
        mode: pingUrl ? "no-cors" : "same-origin",
        signal,
      });
      if (!pingUrl && !response.ok) {
        throw new Error("ping failed");
      }
    });
  } catch {
    return "offline";
  }
  return Date.now() - startedAt > SLOW_PING_MS ? "slow" : "online";
}

/** `pingUrl` should be on the API host; when omitted, falls back to a same-origin asset. */
export function useConnectionStatus(
  pingUrl?: string,
  intervalMs: number = DEFAULT_PING_INTERVAL_MS,
): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const check = async (): Promise<void> => {
      if (inFlight) {
        return;
      }
      inFlight = true;
      const next = await pingOnce(pingUrl);
      inFlight = false;
      if (!cancelled) {
        setStatus(next);
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), intervalMs);

    const onOnline = (): void => void check();
    const onOffline = (): void => setStatus("offline");
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "visible") {
        void check();
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pingUrl, intervalMs]);

  return status;
}

/** The API origin to ping, derived from the panel items URL; undefined if it can't be parsed. */
export function apiPingUrl(feedbackPanelItemsApiUrl: string | undefined): string | undefined {
  if (!feedbackPanelItemsApiUrl) {
    return undefined;
  }
  try {
    return `${new URL(feedbackPanelItemsApiUrl).origin}/`;
  } catch {
    return undefined;
  }
}
