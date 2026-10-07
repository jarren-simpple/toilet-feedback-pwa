import type { PanelConfig } from "../../entities/panel/config";
import type { FeedbackPanelApiResponse, GateAuthFailureReason, GateAuthResult } from "../../entities/panel/types";

interface GateAuthPayload {
  locationCode: string;
  password: string;
}

const AUTH_TIMEOUT_MS = 10_000;

function asPanelResponse(data: unknown): FeedbackPanelApiResponse | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  return data as FeedbackPanelApiResponse;
}

function invalidAuthResult(failureReason: GateAuthFailureReason): GateAuthResult {
  return {
    isValid: false,
    panelResponse: null,
    failureReason,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  let timeoutId = 0;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error("timeout"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fetch(url, init), timeout]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function authenticateGateWithBackend(
  config: PanelConfig,
  payload: GateAuthPayload,
): Promise<GateAuthResult> {
  const endpoint = config.feedbackPanelItemsApiUrl?.trim();
  if (!endpoint) {
    return invalidAuthResult("no_endpoint");
  }

  try {
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_code: payload.locationCode,
          password: payload.password,
        }),
      },
      AUTH_TIMEOUT_MS,
    );
    if (!response.ok) {
      return invalidAuthResult("http_error");
    }

    const raw = await response.json();
    if (raw === false) {
      return invalidAuthResult("invalid_credentials");
    }

    const data = asPanelResponse(raw);
    if (!data) {
      return invalidAuthResult("invalid_response");
    }

    return { isValid: true, panelResponse: data };
  } catch {
    return invalidAuthResult("network_error");
  }
}
