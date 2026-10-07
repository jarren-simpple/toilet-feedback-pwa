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
 * Fire-and-forget: a missed heartbeat isn't fatal, so failures are swallowed
 * rather than surfaced or retried.
 */
export async function sendHeartbeat(heartbeatUrl: string, feedbackPanelId: number): Promise<void> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);

  try {
    await fetch(heartbeatUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feedback_panel_id: feedbackPanelId,
        network_type: getNetworkType(),
      }),
      signal: controller.signal,
    });
  } catch {
    // Ignored: heartbeat delivery is best-effort.
  } finally {
    window.clearTimeout(timeoutId);
  }
}
