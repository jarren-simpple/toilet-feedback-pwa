import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSubmissionQueue } from "./flushSubmissionQueue";
import { enqueueSubmission, getQueuedSubmissions } from "./queueStorage";

class MemoryStorage {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as Response;
}

interface FetchBehavior {
  ip?: "ok" | "unreachable";
  availability?: "available" | "unavailable" | "unreachable";
  submit?: "ok" | "cooldown" | "unreachable" | "http_error";
}

function stubFetch(behavior: FetchBehavior): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
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
      return jsonResponse(behavior.submit !== "cooldown");
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("flushSubmissionQueue", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing and reports drained when the queue is empty", async () => {
    const fetchMock = stubFetch({});
    await expect(flushSubmissionQueue()).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resubmits a queued positive rating and removes it once it succeeds", async () => {
    stubFetch({ ip: "ok", availability: "available", submit: "ok" });
    enqueueSubmission({ feedbackPanelId: 7, rating: "excellent" });

    await expect(flushSubmissionQueue()).resolves.toBe(true);
    expect(getQueuedSubmissions()).toEqual([]);
  });

  it("resubmits a queued negative rating with its item ids", async () => {
    stubFetch({ ip: "ok", availability: "available", submit: "ok" });
    enqueueSubmission({ feedbackPanelId: 7, rating: "poor", selectedItemIds: ["1", "2"] });

    await expect(flushSubmissionQueue()).resolves.toBe(true);
    expect(getQueuedSubmissions()).toEqual([]);
  });

  it("leaves the entry queued and reports not drained while still offline", async () => {
    stubFetch({ ip: "unreachable" });
    enqueueSubmission({ feedbackPanelId: 7, rating: "excellent" });

    await expect(flushSubmissionQueue()).resolves.toBe(false);
    expect(getQueuedSubmissions()).toHaveLength(1);
  });

  it("stops at the first still-unreachable entry without touching entries after it", async () => {
    const fetchMock = stubFetch({ ip: "unreachable" });
    enqueueSubmission({ feedbackPanelId: 7, rating: "excellent" });
    enqueueSubmission({ feedbackPanelId: 7, rating: "good" });

    await expect(flushSubmissionQueue()).resolves.toBe(false);
    expect(getQueuedSubmissions()).toHaveLength(2);
    // Only the first entry's ip lookup should have been attempted.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops an entry that comes back as a confirmed cooldown rather than retrying it forever", async () => {
    stubFetch({ ip: "ok", availability: "available", submit: "cooldown" });
    enqueueSubmission({ feedbackPanelId: 7, rating: "excellent" });

    await expect(flushSubmissionQueue()).resolves.toBe(true);
    expect(getQueuedSubmissions()).toEqual([]);
  });

  it("drops a negative-rating entry whose item ids are no longer valid", async () => {
    stubFetch({ ip: "ok", availability: "available", submit: "ok" });
    enqueueSubmission({ feedbackPanelId: 7, rating: "poor", selectedItemIds: ["not-numeric"] });

    await expect(flushSubmissionQueue()).resolves.toBe(true);
    expect(getQueuedSubmissions()).toEqual([]);
  });

  it("treats a non-2xx submit response as unreachable and keeps the entry queued", async () => {
    stubFetch({ ip: "ok", availability: "available", submit: "http_error" });
    enqueueSubmission({ feedbackPanelId: 7, rating: "excellent" });

    await expect(flushSubmissionQueue()).resolves.toBe(false);
    expect(getQueuedSubmissions()).toHaveLength(1);
  });
});
