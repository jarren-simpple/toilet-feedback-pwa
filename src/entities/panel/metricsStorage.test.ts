import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPanelMetrics,
  getStoredPanelMetrics,
  savePanelMetrics,
} from "./metricsStorage";
import type { PanelState } from "../../shared/types/panelState";

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

const snapshot: PanelState = {
  locationLabel: "L1",
  footfall: 42,
  temperatureC: 26.5,
  humidityPct: 61,
  updatedAt: "2026-09-01T12:00:00.000Z",
};

describe("metricsStorage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves and restores matching panel metrics", () => {
    savePanelMetrics(snapshot, 7);
    expect(getStoredPanelMetrics("L1", 7)).toEqual(snapshot);
  });

  it("ignores metrics stored for a different location or panel", () => {
    savePanelMetrics(snapshot, 7);
    expect(getStoredPanelMetrics("L2", 7)).toBeNull();
    expect(getStoredPanelMetrics("L1", 8)).toBeNull();
  });

  it("clears stored metrics", () => {
    savePanelMetrics(snapshot, 7);
    clearPanelMetrics();
    expect(getStoredPanelMetrics("L1", 7)).toBeNull();
  });
});
