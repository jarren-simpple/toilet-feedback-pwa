import { ratingToSubmitLabel } from "../../entities/panel/config";
import type { Rating } from "../types/rating";
import { buildFeedbackEndpoints, buildTier2SubmitUrl } from "../../entities/panel/endpoints";
import { getCurrentIpv4Address } from "./ip";
import { runWithTimeout } from "../lib/timeout";

/** Availability is only a pre-check (errors are swallowed), so give up on it quickly. */
const AVAILABILITY_TIMEOUT_MS = 3_000;
/** Covers the whole submit, including reading the response body. */
const SUBMIT_TIMEOUT_MS = 10_000;

export interface FeedbackSubmissionOptions {
  /**
   * Overall deadline across the IP lookup, availability check and submit. Aborting it surfaces
   * as `network_unavailable`, so an interactive caller can queue and move on instead of keeping
   * the visitor waiting on a weak link.
   */
  signal?: AbortSignal;
}

/**
 * Only the fields a submission actually needs — narrower than `PanelConfig` so
 * a queued/replayed submission (see `features/feedback/queue`) doesn't have to
 * fabricate an entire panel config to resubmit itself later.
 */
export interface FeedbackSubmissionTarget {
  feedbackPanelId?: number;
  feedbackPanelItemsApiUrl?: string;
}

export type FeedbackSubmissionFailureReason = "network_unavailable" | "cooldown" | "invalid_items";

/**
 * `reason` distinguishes "the server is unreachable" (worth retrying once the
 * network is back) from "the server explicitly rejected this" (retrying can
 * never help). Callers that queue offline submissions branch on this.
 */
export class FeedbackSubmissionError extends Error {
  readonly reason: FeedbackSubmissionFailureReason;

  constructor(reason: FeedbackSubmissionFailureReason) {
    super(reason);
    this.name = "FeedbackSubmissionError";
    this.reason = reason;
  }
}

export async function submitPositiveRatingFeedback(
  target: FeedbackSubmissionTarget,
  rating: Rating,
  options: FeedbackSubmissionOptions = {},
): Promise<void> {
  if (!(rating === "excellent" || rating === "good")) {
    return;
  }
  if (!target.feedbackPanelId) {
    return;
  }

  const endpoints = buildFeedbackEndpoints(target.feedbackPanelItemsApiUrl);
  const ip = await getCurrentIpv4Address(options.signal);
  if (!ip) {
    throw new FeedbackSubmissionError("network_unavailable");
  }

  await ensureFeedbackAvailable(endpoints.availabilityUrl, target.feedbackPanelId, ip, options.signal);

  const ratingLabel = ratingToSubmitLabel(rating);
  const payload = new URLSearchParams({
    rating: ratingLabel,
    description: ratingLabel,
    feedback_panel_id: String(target.feedbackPanelId),
    ip,
    patron_name: "",
    patron_mobile_number: "",
    lat: "",
    lng: "",
  });

  await postFeedbackForm(endpoints.submitUrl, payload, options.signal);
}

export async function submitNegativeRatingFeedback(
  target: FeedbackSubmissionTarget,
  rating: Rating,
  selectedItemIds: string[],
  options: FeedbackSubmissionOptions = {},
): Promise<void> {
  if (!(rating === "neutral" || rating === "poor")) {
    return;
  }
  if (!target.feedbackPanelId || selectedItemIds.length === 0) {
    return;
  }

  const endpoints = buildFeedbackEndpoints(target.feedbackPanelItemsApiUrl);
  const submitUrl = buildTier2SubmitUrl(target.feedbackPanelItemsApiUrl, endpoints.submitUrl);
  const ip = await getCurrentIpv4Address(options.signal);
  if (!ip) {
    throw new FeedbackSubmissionError("network_unavailable");
  }

  await ensureFeedbackAvailable(endpoints.availabilityUrl, target.feedbackPanelId, ip, options.signal);

  const ratingLabel = toNegativeSubmitLabel(rating);
  const normalizedItemIds = normalizeNumericItemIds(selectedItemIds);
  if (normalizedItemIds.length === 0) {
    throw new FeedbackSubmissionError("invalid_items");
  }
  const payload = new URLSearchParams({
    rating: ratingLabel,
    description: ratingLabel,
    feedback_panel_id: String(target.feedbackPanelId),
    ip,
    patron_name: "",
    patron_mobile_number: "",
    comments: "",
    lat: "",
    lng: "",
  });

  for (const itemId of normalizedItemIds) {
    payload.append("item_id[]", itemId);
  }

  await postFeedbackForm(submitUrl, payload, options.signal);
}

function normalizeNumericItemIds(selectedItemIds: string[]): string[] {
  const numericIds = new Set<string>();
  for (const itemId of selectedItemIds) {
    const trimmed = itemId.trim();
    if (/^\d+$/.test(trimmed)) {
      numericIds.add(trimmed);
    }
  }
  return [...numericIds];
}

function toNegativeSubmitLabel(rating: Rating): string {
  if (rating === "poor") {
    return "Bad";
  }
  return ratingToSubmitLabel(rating);
}

/**
 * Throws only on a confirmed cooldown (an explicit `false` from a reachable
 * endpoint). An unreachable availability endpoint is not itself a reason to
 * block submission — the submit call right after this is what actually proves
 * whether the network is up, so any error here besides a real cooldown is
 * swallowed and the caller proceeds to attempt the submit.
 */
async function ensureFeedbackAvailable(
  availabilityUrl: string,
  feedbackPanelId: number,
  ip: string,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const isAvailable = await callFeedbackAvailability(availabilityUrl, feedbackPanelId, ip, signal);
    if (!isAvailable) {
      throw new FeedbackSubmissionError("cooldown");
    }
  } catch (error: unknown) {
    if (error instanceof FeedbackSubmissionError) {
      throw error;
    }
  }
}

async function callFeedbackAvailability(
  availabilityUrl: string,
  feedbackPanelId: number,
  ip: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const url = new URL(availabilityUrl);
  url.searchParams.set("feedback_panel_id", String(feedbackPanelId));
  url.searchParams.set("ip", ip);

  return runWithTimeout(
    AVAILABILITY_TIMEOUT_MS,
    async (timeoutSignal) => {
      const response = await fetch(url.toString(), { signal: timeoutSignal, cache: "no-store" });
      if (!response.ok) {
        return true;
      }
      const data = (await response.json()) as unknown;
      return data !== false;
    },
    signal,
  );
}

/**
 * `false` in the response body is the backend's one way of signalling an
 * explicit rejection (a real cooldown). Everything else that keeps this from
 * succeeding — `fetch` throwing, a non-2xx response, an unparsable body — is
 * treated as the server being unreachable rather than assumed to be a
 * cooldown, so it can be queued and retried instead of shown to the visitor
 * as a wrong "you're on cooldown" message. A timeout counts as unreachable too.
 */
async function postFeedbackForm(submitUrl: string, payload: URLSearchParams, signal?: AbortSignal): Promise<void> {
  let body: unknown;
  try {
    body = await runWithTimeout(
      SUBMIT_TIMEOUT_MS,
      async (timeoutSignal) => {
        const response = await fetch(submitUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: payload.toString(),
          signal: timeoutSignal,
        });
        if (!response.ok) {
          throw new FeedbackSubmissionError("network_unavailable");
        }
        return (await response.json()) as unknown;
      },
      signal,
    );
  } catch {
    throw new FeedbackSubmissionError("network_unavailable");
  }

  if (body === false) {
    throw new FeedbackSubmissionError("cooldown");
  }
}
