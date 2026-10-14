import type { PanelConfig } from "../../entities/panel/config";
import type { FeedbackPanelApiResponse, GateAuthFailureReason, GateAuthResult } from "../../entities/panel/types";
import { runWithTimeout } from "../lib/timeout";

interface GateAuthPayload {
  locationCode: string;
  password: string;
}

/**
 * Covers the whole login including the body, which carries a base64 QR code and can be slow on
 * 2G. Longer than the other calls because a timeout here leaves the kiosk on the gate screen.
 */
const AUTH_TIMEOUT_MS = 20_000;

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

export async function authenticateGateWithBackend(
  config: PanelConfig,
  payload: GateAuthPayload,
): Promise<GateAuthResult> {
  const endpoint = config.feedbackPanelItemsApiUrl?.trim();
  if (!endpoint) {
    return invalidAuthResult("no_endpoint");
  }

  try {
    const result = await runWithTimeout(AUTH_TIMEOUT_MS, async (signal) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_code: payload.locationCode,
          password: payload.password,
        }),
        cache: "no-store",
        signal,
      });
      if (!response.ok) {
        return { ok: false as const };
      }
      return { ok: true as const, raw: (await response.json()) as unknown };
    });
    if (!result.ok) {
      return invalidAuthResult("http_error");
    }

    const raw = result.raw;
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
