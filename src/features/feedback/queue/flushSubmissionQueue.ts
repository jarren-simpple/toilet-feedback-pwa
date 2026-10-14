import {
  FeedbackSubmissionError,
  submitNegativeRatingFeedback,
  submitPositiveRatingFeedback,
} from "../../../shared/api/feedbackApi";
import { isNegativePathRating } from "../../../shared/types/rating";
import {
  getQueueCooldownUntil,
  getQueuedSubmissions,
  pruneExpiredSubmissions,
  removeQueuedSubmission,
  setQueueCooldownUntil,
  type QueuedFeedbackSubmission,
} from "./queueStorage";

/**
 * The backend allows one submission per panel every 5 minutes. A replayed backlog hits that on
 * every entry after the first, so wait it out (plus a margin for clock drift) rather than drop
 * the feedback.
 */
export const QUEUE_COOLDOWN_MS = 5.5 * 60 * 1000;

export type FlushResult =
  | { status: "drained" }
  /** Still unreachable; retry on the caller's backoff. */
  | { status: "offline" }
  /** Backend cooldown is active; nothing will succeed before `retryAtMs`. */
  | { status: "cooldown"; retryAtMs: number };

/**
 * Resubmits queued entries oldest-first and stops at the first one that is
 * still unreachable — the rest would fail identically, so there is no point
 * burning through all of them on one attempt; the caller retries later.
 *
 * A cooldown keeps the entry and pauses the whole queue until it passes. Item
 * ids that are no longer valid can never succeed, so that entry is dropped and
 * the next one is tried instead. Entries older than a day are dropped.
 */
export async function flushSubmissionQueue(nowMs: () => number = Date.now): Promise<FlushResult> {
  pruneExpiredSubmissions(nowMs());

  const cooldownUntil = getQueueCooldownUntil();
  if (cooldownUntil !== null && nowMs() < cooldownUntil) {
    return getQueuedSubmissions().length === 0 ? { status: "drained" } : { status: "cooldown", retryAtMs: cooldownUntil };
  }
  if (cooldownUntil !== null) {
    setQueueCooldownUntil(null);
  }

  for (const entry of getQueuedSubmissions()) {
    try {
      await resubmit(entry);
      removeQueuedSubmission(entry.id);
    } catch (error: unknown) {
      if (error instanceof FeedbackSubmissionError && error.reason === "cooldown") {
        const retryAtMs = nowMs() + QUEUE_COOLDOWN_MS;
        setQueueCooldownUntil(retryAtMs);
        return { status: "cooldown", retryAtMs };
      }
      if (error instanceof FeedbackSubmissionError && error.reason === "invalid_items") {
        removeQueuedSubmission(entry.id);
        continue;
      }
      return { status: "offline" };
    }
  }
  return { status: "drained" };
}

async function resubmit(entry: QueuedFeedbackSubmission): Promise<void> {
  const target = { feedbackPanelId: entry.feedbackPanelId, feedbackPanelItemsApiUrl: entry.feedbackPanelItemsApiUrl };
  if (isNegativePathRating(entry.rating)) {
    await submitNegativeRatingFeedback(target, entry.rating, entry.selectedItemIds ?? []);
    return;
  }
  await submitPositiveRatingFeedback(target, entry.rating);
}
