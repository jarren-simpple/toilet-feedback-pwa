import {
  FeedbackSubmissionError,
  submitNegativeRatingFeedback,
  submitPositiveRatingFeedback,
} from "../../../shared/api/feedbackApi";
import { isNegativePathRating } from "../../../shared/types/rating";
import { getQueuedSubmissions, removeQueuedSubmission, type QueuedFeedbackSubmission } from "./queueStorage";

/**
 * Resubmits queued entries oldest-first and stops at the first one that is
 * still unreachable — the rest would fail identically, so there is no point
 * burning through all of them on one attempt; the caller retries later. A
 * confirmed rejection (a real cooldown, or item ids that are no longer valid)
 * can never succeed on retry, so that entry is dropped and the next one is
 * tried instead.
 *
 * Returns true once the queue is fully drained.
 */
export async function flushSubmissionQueue(): Promise<boolean> {
  for (const entry of getQueuedSubmissions()) {
    try {
      await resubmit(entry);
      removeQueuedSubmission(entry.id);
    } catch (error: unknown) {
      if (error instanceof FeedbackSubmissionError && error.reason !== "network_unavailable") {
        removeQueuedSubmission(entry.id);
        continue;
      }
      return false;
    }
  }
  return true;
}

async function resubmit(entry: QueuedFeedbackSubmission): Promise<void> {
  const target = { feedbackPanelId: entry.feedbackPanelId, feedbackPanelItemsApiUrl: entry.feedbackPanelItemsApiUrl };
  if (isNegativePathRating(entry.rating)) {
    await submitNegativeRatingFeedback(target, entry.rating, entry.selectedItemIds ?? []);
    return;
  }
  await submitPositiveRatingFeedback(target, entry.rating);
}
