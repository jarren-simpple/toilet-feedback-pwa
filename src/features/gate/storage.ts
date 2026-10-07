import { clearPanelMetrics } from "../../entities/panel/metricsStorage";
import { readLocalStorageItem, removeLocalStorageItem, writeLocalStorageItem } from "../../shared/lib/browserStorage";
import { clearPanelSession } from "./panelSession";

const STORAGE_KEY = "simpple-feedback-panel-setup";
const STORAGE_VERSION = 2;

interface StoredSetup {
  v: number;
  locationCode: string;
  password: string;
}

export interface StoredGateSetup {
  locationCode: string;
  password: string;
}

function readStored(): StoredSetup | null {
  const raw = readLocalStorageItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const data = JSON.parse(raw) as StoredSetup;
    if (
      typeof data.locationCode !== "string" ||
      data.locationCode.trim() === "" ||
      typeof data.password !== "string" ||
      data.password.trim() === ""
    ) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function writeStored(locationCode: string, password: string): void {
  const payload: StoredSetup = {
    v: STORAGE_VERSION,
    locationCode: locationCode.trim(),
    password: password.trim(),
  };
  writeLocalStorageItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearGateSetup(): void {
  removeLocalStorageItem(STORAGE_KEY);
}

export function clearPersistedPanelState(): void {
  clearGateSetup();
  clearPanelSession();
  clearPanelMetrics();
}

export function getStoredGateSetup(): StoredGateSetup | null {
  const stored = readStored();
  if (!stored) {
    return null;
  }
  return {
    locationCode: stored.locationCode,
    password: stored.password,
  };
}

export function saveGateSetup(locationCode: string, password: string): void {
  writeStored(locationCode, password);
}
