import { readLocalStorageItem, writeLocalStorageItem } from "../../../shared/lib/browserStorage";
import type { Rating } from "../../../shared/types/rating";

export const SUBMISSION_QUEUE_STORAGE_KEY = "simpple-feedback-submission-queue";
const STORAGE_VERSION = 1;

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

function readQueue(): QueuedFeedbackSubmission[] {
  const raw = readLocalStorageItem(SUBMISSION_QUEUE_STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as StoredQueue;
    if (!parsed || !Array.isArray(parsed.entries)) {
      return [];
    }
    return parsed.entries.filter(isQueuedFeedbackSubmission);
  } catch {
    return [];
  }
}

function writeQueue(entries: QueuedFeedbackSubmission[]): void {
  const payload: StoredQueue = { v: STORAGE_VERSION, entries };
  writeLocalStorageItem(SUBMISSION_QUEUE_STORAGE_KEY, JSON.stringify(payload));
}

export function getQueuedSubmissions(): QueuedFeedbackSubmission[] {
  return readQueue();
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
  writeQueue([...readQueue(), queued]);
  return queued;
}

export function removeQueuedSubmission(id: string): void {
  writeQueue(readQueue().filter((entry) => entry.id !== id));
}
