import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  QUEUE_MAX_ENTRIES,
  enqueueSubmission,
  getQueueCooldownUntil,
  getQueuedSubmissions,
  removeQueuedSubmission,
  setQueueCooldownUntil,
} from "./queueStorage";

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

describe("queueStorage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts empty", () => {
    expect(getQueuedSubmissions()).toEqual([]);
  });

  it("enqueues and lists submissions in insertion order, oldest first", () => {
    enqueueSubmission({ feedbackPanelId: 1, rating: "poor", selectedItemIds: ["1"] });
    enqueueSubmission({ feedbackPanelId: 1, rating: "excellent" });

    const queued = getQueuedSubmissions();
    expect(queued).toHaveLength(2);
    expect(queued[0].rating).toBe("poor");
    expect(queued[1].rating).toBe("excellent");
  });

  it("assigns each entry a unique id and an enqueuedAt timestamp", () => {
    const first = enqueueSubmission({ feedbackPanelId: 1, rating: "good" });
    const second = enqueueSubmission({ feedbackPanelId: 1, rating: "good" });
    expect(first.id).not.toBe(second.id);
    expect(Number.isNaN(Date.parse(first.enqueuedAt))).toBe(false);
  });

  it("removes only the matching entry", () => {
    const first = enqueueSubmission({ feedbackPanelId: 1, rating: "good" });
    const second = enqueueSubmission({ feedbackPanelId: 1, rating: "poor", selectedItemIds: ["2"] });

    removeQueuedSubmission(first.id);

    const remaining = getQueuedSubmissions();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(second.id);
  });

  it("survives being read back after a JSON round-trip (simulated reload)", () => {
    enqueueSubmission({ feedbackPanelId: 42, feedbackPanelItemsApiUrl: "https://api.test/x", rating: "neutral", selectedItemIds: ["3", "4"] });

    // A fresh read (e.g. after a page reload) goes through the same
    // localStorage-backed path, so this exercises persistence, not just
    // an in-memory cache.
    const queued = getQueuedSubmissions();
    expect(queued).toEqual([
      expect.objectContaining({
        feedbackPanelId: 42,
        feedbackPanelItemsApiUrl: "https://api.test/x",
        rating: "neutral",
        selectedItemIds: ["3", "4"],
      }),
    ]);
  });

  it("ignores malformed stored data instead of throwing", () => {
    localStorage.setItem("simpple-feedback-submission-queue", "{not json");
    expect(getQueuedSubmissions()).toEqual([]);
  });

  it("keeps only the newest entries once the cap is reached", () => {
    for (let index = 0; index < QUEUE_MAX_ENTRIES + 5; index += 1) {
      enqueueSubmission({ feedbackPanelId: index, rating: "good" });
    }
    const queued = getQueuedSubmissions();
    expect(queued).toHaveLength(QUEUE_MAX_ENTRIES);
    expect(queued[0].feedbackPanelId).toBe(5);
  });

  it("keeps the cooldown window when entries are added or removed", () => {
    setQueueCooldownUntil(123_456);
    const entry = enqueueSubmission({ feedbackPanelId: 1, rating: "good" });
    expect(getQueueCooldownUntil()).toBe(123_456);
    removeQueuedSubmission(entry.id);
    expect(getQueueCooldownUntil()).toBe(123_456);
    setQueueCooldownUntil(null);
    expect(getQueueCooldownUntil()).toBeNull();
  });
});
