import type { PanelDataProvider, PanelState } from "../../shared/types/panelState";
import { getStoredPanelMetrics, savePanelMetrics, snapshotHasBackupMetrics } from "./metricsStorage";
import { NETWORK_RETRY_DELAYS_MS } from "../../shared/lib/retry";

type RealtimeStatus = "connecting" | "live" | "stale" | "error";

interface SensorMetricsEventPayload {
  panel_id?: number;
  /** Canonical keys from FeedbackPanelRealtimeService */
  footfall?: number | null;
  temperature?: number | null;
  humidity?: number | null;
  /** Legacy / alternate names */
  footfall_today?: number | null;
  temperature_c?: number | null;
  humidity_pct?: number | null;
  sensor_timestamp?: string | null;
  received_at?: string | null;
}

interface RealtimeUrls {
  latestMetricsUrl?: string;
}

export interface PanelMetricsCache {
  load(): PanelState | null;
  save(snapshot: PanelState): void;
}

interface CreatePanelRealtimeProviderOptions {
  locationLabel: string;
  panelId?: number;
  urls: RealtimeUrls;
  pollIntervalMs?: number;
  staleAfterMs?: number;
  retryDelaysMs?: readonly number[];
  onStatusChange?: (status: RealtimeStatus) => void;
  now?: () => number;
  fetchImpl?: typeof fetch;
  metricsCache?: PanelMetricsCache;
}

interface PanelRealtimeProvider extends PanelDataProvider {
  getStatus(): RealtimeStatus;
  start(): void;
  stop(): void;
}

interface ParsedMetricsEvent {
  panelId?: number;
  update: Partial<PanelState>;
}

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const DEFAULT_STALE_AFTER_MS = 150_000;

export function createLocalStorageMetricsCache(locationLabel: string, panelId?: number): PanelMetricsCache {
  return {
    load(): PanelState | null {
      return getStoredPanelMetrics(locationLabel, panelId);
    },
    save(snapshot: PanelState): void {
      savePanelMetrics(snapshot, panelId);
    },
  };
}

export function createPanelRealtimeProvider(options: CreatePanelRealtimeProviderOptions): PanelRealtimeProvider {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const retryDelaysMs = options.retryDelaysMs ?? NETWORK_RETRY_DELAYS_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Date.now());
  const metricsCache = options.metricsCache ?? createLocalStorageMetricsCache(options.locationLabel, options.panelId);

  const cachedSnapshot = metricsCache.load();
  let snapshot: PanelState = cachedSnapshot
    ? { ...cachedSnapshot, locationLabel: options.locationLabel }
    : emptyPanelSnapshot(options.locationLabel);
  let status: RealtimeStatus = snapshotHasBackupMetrics(snapshot) ? "stale" : "connecting";
  let lastSuccessAtMs: number | null = parseTimestampMs(snapshot.updatedAt);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let staleCheckTimer: ReturnType<typeof setInterval> | null = null;
  let retryAttempt = 0;
  let inFlight = false;
  let stopped = true;
  let abortController: AbortController | null = null;

  const listeners = new Set<() => void>();

  const emit = (): void => {
    listeners.forEach((listener) => listener());
  };

  const setStatus = (nextStatus: RealtimeStatus): void => {
    if (status === nextStatus) {
      return;
    }
    status = nextStatus;
    options.onStatusChange?.(status);
    emit();
  };

  const persistSnapshot = (nextSnapshot: PanelState): void => {
    try {
      metricsCache.save(nextSnapshot);
    } catch {
      // Storage is a backup only; live polling should continue without it.
    }
  };

  const applySnapshotUpdate = (update: Partial<PanelState>): void => {
    snapshot = mergePanelSnapshot(snapshot, update, options.locationLabel);
    lastSuccessAtMs = now();
    persistSnapshot(snapshot);
    setStatus("live");
    emit();
  };

  const markPollFailure = (): void => {
    if (snapshotHasBackupMetrics(snapshot)) {
      setStatus("stale");
      return;
    }
    setStatus("error");
  };

  const clearPollTimer = (): void => {
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  const scheduleNextPoll = (delayMs: number): void => {
    if (stopped) {
      return;
    }
    clearPollTimer();
    pollTimer = setTimeout(() => {
      pollTimer = null;
      void readLatestMetrics();
    }, delayMs);
  };

  const scheduleAfterResult = (ok: boolean): void => {
    if (ok) {
      retryAttempt = 0;
      scheduleNextPoll(pollIntervalMs);
      return;
    }
    const lastIndex = retryDelaysMs.length - 1;
    const delayMs = retryDelaysMs[Math.min(retryAttempt, lastIndex)] ?? pollIntervalMs;
    retryAttempt += 1;
    scheduleNextPoll(delayMs);
  };

  const readLatestMetrics = async (): Promise<void> => {
    if (stopped || inFlight || !options.urls.latestMetricsUrl) {
      return;
    }
    inFlight = true;
    clearPollTimer();
    abortController = new AbortController();
    let ok = false;
    try {
      const response = await fetchImpl(options.urls.latestMetricsUrl, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        signal: abortController.signal,
      });
      if (stopped) {
        return;
      }
      if (!response.ok) {
        markPollFailure();
        return;
      }
      const payload = (await response.json()) as unknown;
      const parsed = parsePanelMetricsPayload(payload);
      if (!parsed) {
        markPollFailure();
        return;
      }
      if (typeof options.panelId === "number" && typeof parsed.panelId === "number" && parsed.panelId !== options.panelId) {
        ok = true;
        return;
      }
      applySnapshotUpdate(parsed.update);
      ok = true;
    } catch (error) {
      if (stopped || (error instanceof Error && error.name === "AbortError")) {
        return;
      }
      markPollFailure();
    } finally {
      inFlight = false;
      abortController = null;
      if (!stopped) {
        scheduleAfterResult(ok);
      }
    }
  };

  const onVisibilityChange = (): void => {
    if (typeof document === "undefined" || document.visibilityState !== "visible") {
      return;
    }
    void readLatestMetrics();
  };

  const onOnline = (): void => {
    void readLatestMetrics();
  };

  return {
    getSnapshot(): PanelState {
      return snapshot;
    },
    getStatus(): RealtimeStatus {
      return status;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start(): void {
      stopped = false;
      if (!options.urls.latestMetricsUrl) {
        markPollFailure();
        return;
      }
      if (!snapshotHasBackupMetrics(snapshot)) {
        setStatus("connecting");
      }
      void readLatestMetrics();
      if (staleCheckTimer === null) {
        staleCheckTimer = setInterval(() => {
          if (lastSuccessAtMs === null || status === "error") {
            return;
          }
          if (now() - lastSuccessAtMs > staleAfterMs) {
            setStatus("stale");
          }
        }, 5_000);
      }
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", onVisibilityChange);
      }
      if (typeof window !== "undefined") {
        window.addEventListener("online", onOnline);
      }
    },
    stop(): void {
      stopped = true;
      abortController?.abort();
      abortController = null;
      clearPollTimer();
      if (staleCheckTimer !== null) {
        clearInterval(staleCheckTimer);
        staleCheckTimer = null;
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
      }
    },
  };
}

function emptyPanelSnapshot(locationLabel: string): PanelState {
  return {
    locationLabel,
    footfall: null,
    temperatureC: null,
    humidityPct: null,
    updatedAt: "N/A",
  };
}

function parseTimestampMs(updatedAt: string): number | null {
  if (!updatedAt || updatedAt === "N/A") {
    return null;
  }
  const parsed = Date.parse(updatedAt);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parsePanelMetricsEvent(rawEvent: string): ParsedMetricsEvent | null {
  try {
    const parsed = JSON.parse(rawEvent) as unknown;
    return parsePanelMetricsPayload(parsed);
  } catch {
    return null;
  }
}

function parsePanelMetricsPayload(payload: unknown): ParsedMetricsEvent | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const row = payload as SensorMetricsEventPayload;
  const panelId = asFiniteNumber(row.panel_id);
  return {
    panelId: panelId === null ? undefined : panelId,
    update: {
      footfall: asFiniteNumber(firstDefinedMetric(row.footfall, row.footfall_today)),
      temperatureC: asFiniteNumber(firstDefinedMetric(row.temperature, row.temperature_c)),
      humidityPct: asFiniteNumber(firstDefinedMetric(row.humidity, row.humidity_pct)),
    },
  };
}

/** Prefer first argument when it is defined (including null); else second. */
function firstDefinedMetric(a: unknown, b: unknown): unknown {
  if (typeof a !== "undefined") {
    return a;
  }
  return b;
}

function asFiniteNumber(value: unknown): number | null {
  if (value === null || typeof value === "undefined") {
    return null;
  }
  const normalized = typeof value === "number" ? value : Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

export function mergePanelSnapshot(current: PanelState, update: Partial<PanelState>, locationLabel: string): PanelState {
  return {
    locationLabel: update.locationLabel ?? current.locationLabel ?? locationLabel,
    footfall: pickNullableNumber(update.footfall, current.footfall),
    temperatureC: pickNullableNumber(update.temperatureC, current.temperatureC),
    humidityPct: pickNullableNumber(update.humidityPct, current.humidityPct),
    updatedAt: new Date().toISOString(),
  };
}

function pickNullableNumber(nextValue: number | null | undefined, currentValue: number | null): number | null {
  if (typeof nextValue === "number" || nextValue === null) {
    return nextValue;
  }
  return currentValue;
}

export type { PanelRealtimeProvider, RealtimeStatus, RealtimeUrls };
