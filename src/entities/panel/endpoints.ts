export function buildFeedbackEndpoints(panelItemsUrl: string | undefined): { availabilityUrl: string; submitUrl: string } {
  const fallbackBase = "http://ifsc.test/api/feedback";
  const raw = panelItemsUrl?.trim() ?? "";
  if (!raw) {
    return {
      availabilityUrl: `${fallbackBase}/getFeedbackAvailability`,
      submitUrl: `${fallbackBase}/getFeedback`,
    };
  }

  const base = raw.replace(/\/getFeedbackPanelItems(?:\?.*)?$/i, "");
  if (base !== raw) {
    return {
      availabilityUrl: `${base}/getFeedbackAvailability`,
      submitUrl: `${base}/getFeedback`,
    };
  }

  try {
    const url = new URL(raw);
    const root = `${url.origin}/api/feedback`;
    return {
      availabilityUrl: `${root}/getFeedbackAvailability`,
      submitUrl: `${root}/getFeedback`,
    };
  } catch {
    return {
      availabilityUrl: `${fallbackBase}/getFeedbackAvailability`,
      submitUrl: `${fallbackBase}/getFeedback`,
    };
  }
}

export function buildTier2SubmitUrl(panelItemsUrl: string | undefined, fallbackSubmitUrl: string): string {
  const raw = panelItemsUrl?.trim() ?? "";
  if (!raw) {
    return fallbackSubmitUrl;
  }

  try {
    const url = new URL(raw);
    return `${url.origin}/api/feedback/getFeedback`;
  } catch {
    return fallbackSubmitUrl;
  }
}

export function buildPanelRealtimeUrls(
  realtimeBaseUrl: string | undefined,
  panelId: number | undefined,
): { latestMetricsUrl?: string } {
  if (!realtimeBaseUrl || typeof panelId !== "number") {
    return {};
  }
  const base = realtimeBaseUrl.trim().replace(/\/+$/, "");
  if (base === "") {
    return {};
  }
  return {
    latestMetricsUrl: `${base}/api/feedback/panels/${panelId}/latest-metrics`,
  };
}

export function buildHeartbeatUrl(realtimeBaseUrl: string | undefined): string | undefined {
  if (!realtimeBaseUrl) {
    return undefined;
  }
  const base = realtimeBaseUrl.trim().replace(/\/+$/, "");
  if (base === "") {
    return undefined;
  }
  return `${base}/api/feedback-panels/heartbeat`;
}
