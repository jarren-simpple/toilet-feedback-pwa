import type { PanelState } from "../../shared/types/panelState";
import { readLocalStorageItem, removeLocalStorageItem, writeLocalStorageItem } from "../../shared/lib/browserStorage";

export const PANEL_METRICS_STORAGE_KEY = "simpple-feedback-panel-metrics";
const STORAGE_VERSION = 1;

interface StoredPanelMetrics {
  v: number;
  panelId?: number;
  locationLabel: string;
  footfall: number | null;
  temperatureC: number | null;
  humidityPct: number | null;
  updatedAt: string;
}

function asNullableNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function parseStored(raw: string): StoredPanelMetrics | null {
  try {
    const data = JSON.parse(raw) as StoredPanelMetrics;
    if (!data || typeof data !== "object") {
      return null;
    }
    if (typeof data.locationLabel !== "string" || data.locationLabel.trim() === "") {
      return null;
    }
    if (typeof data.updatedAt !== "string" || data.updatedAt.trim() === "") {
      return null;
    }
    const footfall = asNullableNumber(data.footfall);
    const temperatureC = asNullableNumber(data.temperatureC);
    const humidityPct = asNullableNumber(data.humidityPct);
    if (footfall === undefined || temperatureC === undefined || humidityPct === undefined) {
      return null;
    }
    const panelId = typeof data.panelId === "number" && Number.isFinite(data.panelId) ? data.panelId : undefined;
    return {
      v: STORAGE_VERSION,
      panelId,
      locationLabel: data.locationLabel,
      footfall,
      temperatureC,
      humidityPct,
      updatedAt: data.updatedAt,
    };
  } catch {
    return null;
  }
}

export function getStoredPanelMetrics(locationLabel: string, panelId?: number): PanelState | null {
  const raw = readLocalStorageItem(PANEL_METRICS_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  const stored = parseStored(raw);
  if (!stored) {
    return null;
  }
  if (stored.locationLabel !== locationLabel) {
    return null;
  }
  if (typeof panelId === "number" && typeof stored.panelId === "number" && stored.panelId !== panelId) {
    return null;
  }
  return {
    locationLabel: stored.locationLabel,
    footfall: stored.footfall,
    temperatureC: stored.temperatureC,
    humidityPct: stored.humidityPct,
    updatedAt: stored.updatedAt,
  };
}

export function savePanelMetrics(snapshot: PanelState, panelId?: number): void {
  const payload: StoredPanelMetrics = {
    v: STORAGE_VERSION,
    panelId,
    locationLabel: snapshot.locationLabel,
    footfall: snapshot.footfall,
    temperatureC: snapshot.temperatureC,
    humidityPct: snapshot.humidityPct,
    updatedAt: snapshot.updatedAt,
  };
  writeLocalStorageItem(PANEL_METRICS_STORAGE_KEY, JSON.stringify(payload));
}

export function clearPanelMetrics(): void {
  removeLocalStorageItem(PANEL_METRICS_STORAGE_KEY);
}

export function snapshotHasBackupMetrics(snapshot: PanelState): boolean {
  return (
    snapshot.updatedAt !== "N/A" ||
    typeof snapshot.footfall === "number" ||
    typeof snapshot.temperatureC === "number" ||
    typeof snapshot.humidityPct === "number"
  );
}
