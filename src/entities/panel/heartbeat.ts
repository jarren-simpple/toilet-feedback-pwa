import { runWithTimeout } from "../../shared/lib/timeout";

const HEARTBEAT_TIMEOUT_MS = 8_000;

interface NavigatorConnection {
  effectiveType?: string;
  type?: string;
}

function getNetworkType(): string {
  const connection = (navigator as Navigator & { connection?: NavigatorConnection }).connection;
  const detected = connection?.effectiveType ?? connection?.type;
  if (detected) {
    return detected;
  }
  return navigator.onLine ? "online" : "offline";
}

/**
 * Best-effort: failures are swallowed rather than surfaced. Resolves `true` when the server
 * acknowledged it, so the caller can retry once instead of waiting a full interval.
 */
export async function sendHeartbeat(heartbeatUrl: string, feedbackPanelId: number): Promise<boolean> {
  try {
    return await runWithTimeout(HEARTBEAT_TIMEOUT_MS, async (signal) => {
      const response = await fetch(heartbeatUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback_panel_id: feedbackPanelId,
          network_type: getNetworkType(),
        }),
        signal,
      });
      return response.ok;
    });
  } catch {
    return false;
  }
}
