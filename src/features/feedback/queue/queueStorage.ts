import { readLocalStorageItem, writeLocalStorageItem } from "../../../shared/lib/browserStorage";
import type { Rating } from "../../../shared/types/rating";

export const SUBMISSION_QUEUE_STORAGE_KEY = "simpple-feedback-submission-queue";
const STORAGE_VERSION = 1;

/** Entries older than this are dropped instead of retried forever (e.g. a submit that keeps returning 5xx). */
export const QUEUE_ENTRY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Upper bound so a panel offline for days can't grow localStorage without limit; the oldest entries go first. */
export const QUEUE_MAX_ENTRIES = 500;

/**
 * A feedback submission that failed because the panel was offline, kept until
 * it can be resubmitted. Carries its own `feedbackPanelId` /
 * `feedbackPanelItemsApiUrl` rather than depending on whatever `PanelConfig`
 * happens to be loaded when it is retried — the panel could reload or
 * re-authenticate against a different location in the meantime, and the entry
 * should still go to the panel it was actually given to.
 */
export interface QueuedFeedbackSubmission {
  id: string;
  enqueuedAt: string;
  feedbackPanelId: number;
  feedbackPanelItemsApiUrl?: string;
  rating: Rating;
  /** Present only for the negative-rating (Tier 2) path. */
  selectedItemIds?: string[];
}

interface StoredQueue {
  v: number;
  entries: QueuedFeedbackSubmission[];
  /**
   * Epoch ms until which the backend is known to reject submissions from this panel (its
   * per-panel cooldown). Replays wait this out instead of dropping the entry. Absent = none.
   */
  cooldownUntil?: number;
}

function isQueuedFeedbackSubmission(value: unknown): value is QueuedFeedbackSubmission {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.enqueuedAt === "string" &&
    typeof row.feedbackPanelId === "number" &&
    typeof row.rating === "string" &&
    (row.selectedItemIds === undefined || Array.isArray(row.selectedItemIds))
  );
}

function readStoredQueue(): Omit<StoredQueue, "v"> {
  const raw = readLocalStorageItem(SUBMISSION_QUEUE_STORAGE_KEY);
  if (!raw) {
    return { entries: [] };
  }
  try {
    const parsed = JSON.parse(raw) as StoredQueue;
    if (!parsed || !Array.isArray(parsed.entries)) {
      return { entries: [] };
    }
    const cooldownUntil =
      typeof parsed.cooldownUntil === "number" && Number.isFinite(parsed.cooldownUntil) ? parsed.cooldownUntil : undefined;
    return { entries: parsed.entries.filter(isQueuedFeedbackSubmission), cooldownUntil };
  } catch {
    return { entries: [] };
  }
}

function readQueue(): QueuedFeedbackSubmission[] {
  return readStoredQueue().entries;
}

function writeStoredQueue(entries: QueuedFeedbackSubmission[], cooldownUntil: number | undefined): void {
  const payload: StoredQueue = { v: STORAGE_VERSION, entries, cooldownUntil };
  writeLocalStorageItem(SUBMISSION_QUEUE_STORAGE_KEY, JSON.stringify(payload));
}

function writeQueue(entries: QueuedFeedbackSubmission[]): void {
  writeStoredQueue(entries, readStoredQueue().cooldownUntil);
}

export function getQueuedSubmissions(): QueuedFeedbackSubmission[] {
  return readQueue();
}

export function getQueueCooldownUntil(): number | null {
  return readStoredQueue().cooldownUntil ?? null;
}

export function setQueueCooldownUntil(cooldownUntil: number | null): void {
  writeStoredQueue(readQueue(), cooldownUntil ?? undefined);
}

/** Drops entries past {@link QUEUE_ENTRY_MAX_AGE_MS}. Returns how many were removed. */
export function pruneExpiredSubmissions(nowMs: number = Date.now()): number {
  const entries = readQueue();
  const kept = entries.filter((entry) => {
    const enqueuedAtMs = Date.parse(entry.enqueuedAt);
    return !Number.isFinite(enqueuedAtMs) || nowMs - enqueuedAtMs < QUEUE_ENTRY_MAX_AGE_MS;
  });
  if (kept.length !== entries.length) {
    writeQueue(kept);
  }
  return entries.length - kept.length;
}

function generateQueueEntryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function enqueueSubmission(entry: Omit<QueuedFeedbackSubmission, "id" | "enqueuedAt">): QueuedFeedbackSubmission {
  const queued: QueuedFeedbackSubmission = {
    ...entry,
    id: generateQueueEntryId(),
    enqueuedAt: new Date().toISOString(),
  };
  writeQueue([...readQueue(), queued].slice(-QUEUE_MAX_ENTRIES));
  return queued;
}

export function removeQueuedSubmission(id: string): void {
  writeQueue(readQueue().filter((entry) => entry.id !== id));
}
