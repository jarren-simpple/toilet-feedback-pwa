import { useCallback, useEffect, useRef, useState } from "react";
import { nextNetworkRetryDelayMs } from "../../../shared/lib/retry";
import { flushSubmissionQueue } from "./flushSubmissionQueue";
import { enqueueSubmission, getQueuedSubmissions, type QueuedFeedbackSubmission } from "./queueStorage";

export interface UseSubmissionQueueResult {
  pendingCount: number;
  enqueue: (entry: Omit<QueuedFeedbackSubmission, "id" | "enqueuedAt">) => void;
}

/**
 * Persists a feedback submission that failed because the panel was offline,
 * and keeps retrying the queue in the background — immediately on mount (in
 * case entries survived a reload while still offline), on the browser's
 * `online` event, and on a backoff timer as a fallback for the cases where
 * that event doesn't fire. Reusing `NETWORK_RETRY_DELAYS_MS` (2s up to 30s,
 * same as the realtime metrics poller) rather than hammering the endpoint.
 * While the backend cooldown is active the next attempt waits until it ends.
 *
 * Every request inside a flush has its own timeout, so a stalled connection
 * can't leave `inFlightRef` stuck and silently stop the queue.
 */
export function useSubmissionQueue(): UseSubmissionQueueResult {
  const [pendingCount, setPendingCount] = useState(() => getQueuedSubmissions().length);
  const attemptIndexRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const attemptFlush = useCallback((): void => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    void flushSubmissionQueue()
      .catch(() => ({ status: "offline" as const }))
      .then((result) => {
        setPendingCount(getQueuedSubmissions().length);
        clearTimer();
        if (result.status === "drained") {
          attemptIndexRef.current = 0;
          return;
        }
        let delayMs: number;
        if (result.status === "cooldown") {
          attemptIndexRef.current = 0;
          delayMs = Math.max(result.retryAtMs - Date.now(), 1_000);
        } else {
          delayMs = nextNetworkRetryDelayMs(attemptIndexRef.current);
          attemptIndexRef.current += 1;
        }
        timerRef.current = window.setTimeout(attemptFlush, delayMs);
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [clearTimer]);

  useEffect(() => {
    attemptFlush();
    window.addEventListener("online", attemptFlush);
    return () => {
      window.removeEventListener("online", attemptFlush);
      clearTimer();
    };
  }, [attemptFlush, clearTimer]);

  const enqueue = useCallback(
    (entry: Omit<QueuedFeedbackSubmission, "id" | "enqueuedAt">): void => {
      enqueueSubmission(entry);
      setPendingCount(getQueuedSubmissions().length);
      attemptFlush();
    },
    [attemptFlush],
  );

  return { pendingCount, enqueue };
}
