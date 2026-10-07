import { describe, expect, it, vi } from "vitest";
import { createPanelRealtimeProvider, mergePanelSnapshot, parsePanelMetricsEvent } from "./realtime";
import type { PanelState } from "../../shared/types/panelState";

function delayedPollResponse(payload: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  }) as unknown as typeof fetch;
}

describe("parsePanelMetricsEvent", () => {
  it("maps legacy key names to panel state", () => {
    const result = parsePanelMetricsEvent(
      JSON.stringify({
        panel_id: 3,
        footfall_today: 5,
        temperature_c: 22,
        humidity_pct: 40,
        received_at: "2026-04-23T12:00:00Z",
      }),
    );
    expect(result?.update.footfall).toBe(5);
    expect(result?.update.temperatureC).toBe(22);
    expect(result?.update.humidityPct).toBe(40);
  });

  it("parses canonical backend payload (footfall, temperature, humidity)", () => {
    const result = parsePanelMetricsEvent(
      JSON.stringify({
        panel_id: 22,
        footfall: 120,
        temperature: 27.4,
        humidity: 68.1,
        sensor_timestamp: "2026-04-23T10:22:10Z",
      }),
    );

    expect(result?.panelId).toBe(22);
    expect(result?.update.footfall).toBe(120);
    expect(result?.update.temperatureC).toBe(27.4);
    expect(result?.update.humidityPct).toBe(68.1);
  });

  it("returns null for invalid JSON", () => {
    expect(parsePanelMetricsEvent("{bad json}")).toBeNull();
  });
});

describe("mergePanelSnapshot", () => {
  it("keeps previous values for undefined updates", () => {
    const current: PanelState = {
      locationLabel: "L1",
      footfall: 50,
      temperatureC: 25.3,
      humidityPct: 65.2,
      updatedAt: "2026-04-23T10:00:00Z",
    };

    const merged = mergePanelSnapshot(current, { humidityPct: undefined }, "L1");
    expect(merged.footfall).toBe(50);
    expect(merged.temperatureC).toBe(25.3);
    expect(merged.humidityPct).toBe(65.2);
  });

  it("accepts explicit null values from backend", () => {
    const current: PanelState = {
      locationLabel: "L2",
      footfall: 12,
      temperatureC: 20,
      humidityPct: 55,
      updatedAt: "2026-04-23T10:00:00Z",
    };

    const merged = mergePanelSnapshot(current, { temperatureC: null }, "L2");
    expect(merged.temperatureC).toBeNull();
  });
});

describe("createPanelRealtimeProvider", () => {
  it("polls latest-metrics and becomes live", async () => {
    const fetchImpl = delayedPollResponse({
      panel_id: 7,
      footfall: 12,
      temperature: 24.5,
      humidity: 61,
    });
    const saved: PanelState[] = [];
    const provider = createPanelRealtimeProvider({
      locationLabel: "L1",
      panelId: 7,
      urls: { latestMetricsUrl: "https://example.test/latest-metrics" },
      pollIntervalMs: 60_000,
      fetchImpl,
      metricsCache: {
        load: () => null,
        save: (snapshot) => {
          saved.push(snapshot);
        },
      },
    });

    provider.start();
    await vi.waitFor(() => {
      expect(provider.getStatus()).toBe("live");
    });
    expect(provider.getSnapshot().footfall).toBe(12);
    expect(provider.getSnapshot().temperatureC).toBe(24.5);
    expect(provider.getSnapshot().humidityPct).toBe(61);
    expect(saved.at(-1)?.footfall).toBe(12);
    provider.stop();
  });

  it("stays in error when the poll URL is missing", () => {
    const provider = createPanelRealtimeProvider({
      locationLabel: "L1",
      urls: {},
      metricsCache: {
        load: () => null,
        save: () => undefined,
      },
    });
    provider.start();
    expect(provider.getStatus()).toBe("error");
    provider.stop();
  });

  it("shows cached metrics as stale when polling fails", async () => {
    const cached: PanelState = {
      locationLabel: "L1",
      footfall: 9,
      temperatureC: 26,
      humidityPct: 70,
      updatedAt: "2026-09-01T10:00:00.000Z",
    };
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    const provider = createPanelRealtimeProvider({
      locationLabel: "L1",
      panelId: 7,
      urls: { latestMetricsUrl: "https://example.test/latest-metrics" },
      retryDelaysMs: [20_000],
      fetchImpl,
      metricsCache: {
        load: () => cached,
        save: () => undefined,
      },
    });

    expect(provider.getSnapshot().footfall).toBe(9);
    expect(provider.getStatus()).toBe("stale");
    provider.start();
    await vi.waitFor(() => {
      expect(fetchImpl).toHaveBeenCalled();
    });
    expect(provider.getSnapshot().footfall).toBe(9);
    expect(provider.getSnapshot().temperatureC).toBe(26);
    expect(provider.getStatus()).toBe("stale");
    provider.stop();
  });

  it("retries a failed poll and updates from the next successful response", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          panel_id: 7,
          footfall: 15,
          temperature: 22,
          humidity: 55,
        }),
      }) as unknown as typeof fetch;
    const saved: PanelState[] = [];
    const provider = createPanelRealtimeProvider({
      locationLabel: "L1",
      panelId: 7,
      urls: { latestMetricsUrl: "https://example.test/latest-metrics" },
      pollIntervalMs: 60_000,
      retryDelaysMs: [20],
      fetchImpl,
      metricsCache: {
        load: () => null,
        save: (snapshot) => {
          saved.push(snapshot);
        },
      },
    });

    provider.start();
    await vi.waitFor(() => {
      expect(provider.getStatus()).toBe("live");
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(provider.getSnapshot().footfall).toBe(15);
    expect(saved.at(-1)?.humidityPct).toBe(55);
    provider.stop();
  });
});
