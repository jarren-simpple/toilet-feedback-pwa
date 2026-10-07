import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FeedbackSubmissionError,
  submitNegativeRatingFeedback,
  submitPositiveRatingFeedback,
} from "./feedbackApi";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as Response;
}

interface FetchBehavior {
  ip?: "ok" | "unreachable";
  availability?: "available" | "unavailable" | "unreachable";
  submit?: "ok" | "cooldown" | "unreachable" | "http_error" | "bad_json";
}

function stubFetch(behavior: FetchBehavior): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("ipify")) {
        if (behavior.ip === "unreachable") {
          throw new Error("network down");
        }
        return jsonResponse({ ip: "203.0.113.5" });
      }

      if (url.includes("getFeedbackAvailability")) {
        if (behavior.availability === "unreachable") {
          throw new Error("network down");
        }
        return jsonResponse(behavior.availability !== "unavailable");
      }

      if (url.includes("getFeedback")) {
        if (behavior.submit === "unreachable") {
          throw new Error("network down");
        }
        if (behavior.submit === "http_error") {
          return jsonResponse(true, false);
        }
        if (behavior.submit === "bad_json") {
          return { ok: true, json: () => Promise.reject(new Error("not json")) } as Response;
        }
        return jsonResponse(behavior.submit !== "cooldown");
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}

async function expectReason(promise: Promise<void>, reason: string): Promise<void> {
  await expect(promise).rejects.toMatchObject(
    expect.objectContaining({ reason }) as { reason: string },
  );
}

describe("submitPositiveRatingFeedback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing for a non-positive rating (no fetch attempted)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await submitPositiveRatingFeedback({ feedbackPanelId: 7 }, "neutral");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing without a feedbackPanelId (demo mode)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await submitPositiveRatingFeedback({}, "excellent");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("succeeds when everything is reachable and available", async () => {
    stubFetch({ ip: "ok", availability: "available", submit: "ok" });
    await expect(submitPositiveRatingFeedback({ feedbackPanelId: 7 }, "excellent")).resolves.toBeUndefined();
  });

  it("throws network_unavailable when the IP lookup fails", async () => {
    stubFetch({ ip: "unreachable" });
    await expectReason(submitPositiveRatingFeedback({ feedbackPanelId: 7 }, "excellent"), "network_unavailable");
  });

  it("throws network_unavailable (not cooldown) when the submit request itself fails", async () => {
    stubFetch({ ip: "ok", availability: "available", submit: "unreachable" });
    await expectReason(submitPositiveRatingFeedback({ feedbackPanelId: 7 }, "excellent"), "network_unavailable");
  });

  it("throws network_unavailable (not cooldown) for a non-2xx submit response", async () => {
    stubFetch({ ip: "ok", availability: "available", submit: "http_error" });
    await expectReason(submitPositiveRatingFeedback({ feedbackPanelId: 7 }, "excellent"), "network_unavailable");
  });

  it("throws network_unavailable when the submit response body is not parsable JSON", async () => {
    stubFetch({ ip: "ok", availability: "available", submit: "bad_json" });
    await expectReason(submitPositiveRatingFeedback({ feedbackPanelId: 7 }, "excellent"), "network_unavailable");
  });

  it("throws cooldown only for an explicit false response from a reachable server", async () => {
    stubFetch({ ip: "ok", availability: "available", submit: "cooldown" });
    await expectReason(submitPositiveRatingFeedback({ feedbackPanelId: 7 }, "excellent"), "cooldown");
  });

  it("proceeds to submit even if the availability check itself is unreachable", async () => {
    stubFetch({ ip: "ok", availability: "unreachable", submit: "ok" });
    await expect(submitPositiveRatingFeedback({ feedbackPanelId: 7 }, "excellent")).resolves.toBeUndefined();
  });

  it("throws cooldown when the availability check explicitly says unavailable", async () => {
    stubFetch({ ip: "ok", availability: "unavailable" });
    await expectReason(submitPositiveRatingFeedback({ feedbackPanelId: 7 }, "excellent"), "cooldown");
  });
});

describe("submitNegativeRatingFeedback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws invalid_items when no selected id is numeric", async () => {
    stubFetch({ ip: "ok", availability: "available" });
    await expectReason(
      submitNegativeRatingFeedback({ feedbackPanelId: 7 }, "poor", ["not-a-number"]),
      "invalid_items",
    );
  });

  it("succeeds with valid numeric item ids", async () => {
    stubFetch({ ip: "ok", availability: "available", submit: "ok" });
    await expect(
      submitNegativeRatingFeedback({ feedbackPanelId: 7 }, "poor", ["1", "2"]),
    ).resolves.toBeUndefined();
  });

  it("throws network_unavailable rather than invalid_items when offline", async () => {
    stubFetch({ ip: "unreachable" });
    await expectReason(
      submitNegativeRatingFeedback({ feedbackPanelId: 7 }, "poor", ["1"]),
      "network_unavailable",
    );
  });
});

describe("FeedbackSubmissionError", () => {
  it("carries its reason and name for instanceof-free inspection too", () => {
    const error = new FeedbackSubmissionError("cooldown");
    expect(error.reason).toBe("cooldown");
    expect(error.name).toBe("FeedbackSubmissionError");
    expect(error).toBeInstanceOf(Error);
  });
});
