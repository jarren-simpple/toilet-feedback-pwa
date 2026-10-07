import type { FeedbackPanelApiResponse } from "../../entities/panel/types";
import { readLocalStorageItem, removeLocalStorageItem, writeLocalStorageItem } from "../../shared/lib/browserStorage";

export const PANEL_SESSION_STORAGE_KEY = "simpple-feedback-panel-session";
const STORAGE_VERSION = 1;

export interface StoredPanelSession {
  locationCode: string;
  panelResponse: FeedbackPanelApiResponse;
}

interface StoredPanelSessionRecord {
  v: number;
  locationCode: string;
  panelResponse: FeedbackPanelApiResponse;
}

export function getStoredPanelSession(): StoredPanelSession | null {
  const raw = readLocalStorageItem(PANEL_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const data = JSON.parse(raw) as StoredPanelSessionRecord;
    if (!data || typeof data !== "object") {
      return null;
    }
    if (typeof data.locationCode !== "string" || data.locationCode.trim() === "") {
      return null;
    }
    if (!data.panelResponse || typeof data.panelResponse !== "object" || Array.isArray(data.panelResponse)) {
      return null;
    }
    return {
      locationCode: data.locationCode,
      panelResponse: data.panelResponse,
    };
  } catch {
    return null;
  }
}

export function savePanelSession(locationCode: string, panelResponse: FeedbackPanelApiResponse): void {
  const payload: StoredPanelSessionRecord = {
    v: STORAGE_VERSION,
    locationCode: locationCode.trim(),
    panelResponse,
  };
  writeLocalStorageItem(PANEL_SESSION_STORAGE_KEY, JSON.stringify(payload));
}

export function clearPanelSession(): void {
  removeLocalStorageItem(PANEL_SESSION_STORAGE_KEY);
}
