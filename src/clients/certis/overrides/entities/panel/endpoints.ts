// Certis doesn't use panel sensor metrics or the heartbeat. With no URLs, useFeedbackFlow skips the
// heartbeat timer and the realtime provider never polls latest-metrics. All other endpoints
// (feedback availability/submit, etc.) are the shared ones.
export * from "../../../../../entities/panel/endpoints";

export function buildPanelRealtimeUrls(
  _realtimeBaseUrl: string | undefined,
  _panelId: number | undefined,
): { latestMetricsUrl?: string } {
  return {};
}

export function buildHeartbeatUrl(_realtimeBaseUrl: string | undefined): string | undefined {
  return undefined;
}
