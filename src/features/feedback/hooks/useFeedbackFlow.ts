import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { buildTier1RatingRows, buildTier2Items, resolveResourceImageUrl } from "../../../entities/panel/feedbackAssets";
import type { PanelConfig } from "../../../entities/panel/config";
import { buildDemoPanelSnapshot } from "../../../entities/panel/demoConfig";
import {
  FeedbackSubmissionError,
  submitNegativeRatingFeedback,
  submitPositiveRatingFeedback,
} from "../../../shared/api/feedbackApi";
import type { PanelState } from "../../../shared/types/panelState";
import { isNegativePathRating, type Rating } from "../../../shared/types/rating";
import { createPanelRealtimeProvider, type RealtimeStatus } from "../../../entities/panel/realtime";
import { sendHeartbeat } from "../../../entities/panel/heartbeat";
import { useToast } from "../../../shared/ui/useToast";
import { buildInitialFeedbackModel, feedbackReducer } from "../model/reducer";
import { useSubmissionQueue } from "../queue/useSubmissionQueue";
import { createDeadline } from "../../../shared/lib/timeout";
import { useLoadedImageUrl } from "../../../shared/lib/useLoadedImageUrl";

const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;
/** One missed heartbeat shouldn't make a working panel look offline for a full interval. */
const HEARTBEAT_RETRY_DELAY_MS = 60 * 1000;
/**
 * Longest a visitor waits on the network after tapping. Past this the submission is queued and
 * the flow advances as if it had succeeded; the queue delivers it in the background.
 */
const INTERACTIVE_SUBMIT_DEADLINE_MS = 8_000;

interface UseFeedbackFlowResult {
  model: ReturnType<typeof buildInitialFeedbackModel>;
  snapshot: PanelState;
  tier1Ratings: ReturnType<typeof buildTier1RatingRows>;
  tier2Items: ReturnType<typeof buildTier2Items>;
  isSubmittingFeedback: boolean;
  /** Feedback submissions queued while offline, still waiting to send. */
  pendingSubmissionCount: number;
  realtimeStatus: RealtimeStatus;
  backgroundImageUrl: string | null;
  logoImageUrl: string | null;
  toastMessage: string | null;
  onPickRating: (rating: Rating) => Promise<void>;
  onToggleCategory: (categoryId: string) => void;
  onSubmitTier2Feedback: () => Promise<void>;
  onDismissTier3: () => void;
  onBackToTier1: () => void;
}

function panelAssetUrl(imagePath: string | null | undefined): string | null {
  try {
    return resolveResourceImageUrl(imagePath);
  } catch {
    return null;
  }
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

export function useFeedbackFlow(
  config: PanelConfig,
  locationCode: string,
  isDemoMode = false,
): UseFeedbackFlowResult {
  const [model, dispatch] = useReducer(feedbackReducer, buildInitialFeedbackModel(config));
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const { pendingCount: pendingSubmissionCount, enqueue: enqueueSubmission } = useSubmissionQueue();
  const [snapshot, setSnapshot] = useState<PanelState>(() =>
    isDemoMode ? buildDemoPanelSnapshot(locationCode) : emptyPanelSnapshot(locationCode),
  );
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>(isDemoMode ? "live" : "connecting");
  const { toastMessage, showToast } = useToast();

  const tier1Ratings = useMemo(() => buildTier1RatingRows(config), [config]);
  const tier2Items = useMemo(() => buildTier2Items(config), [config]);
  // Remote images are only applied once they've actually loaded, so a failed or slow download
  // leaves the bundled default background (and no broken logo) instead of a blank panel.
  const backgroundImageUrl = useLoadedImageUrl(
    useMemo(() => panelAssetUrl(config.customBackgroundImage), [config.customBackgroundImage]),
  );
  const logoImageUrl = useLoadedImageUrl(
    useMemo(
      () => panelAssetUrl(config.logoImage) ?? panelAssetUrl(config.secondaryLogoImage),
      [config.logoImage, config.secondaryLogoImage],
    ),
  );

  useEffect(() => {
    dispatch({ type: "reset", config });
  }, [config]);

  useEffect(() => {
    setSnapshot((previous) => ({ ...previous, locationLabel: locationCode }));
  }, [locationCode]);

  useEffect(() => {
    if (isDemoMode) {
      setSnapshot(buildDemoPanelSnapshot(locationCode));
      setRealtimeStatus("live");
      return;
    }

    const provider = createPanelRealtimeProvider({
      locationLabel: locationCode,
      panelId: config.feedbackPanelId,
      urls: {
        latestMetricsUrl: config.panelLatestMetricsUrl,
      },
      onStatusChange: setRealtimeStatus,
    });
    const unsubscribe = provider.subscribe(() => {
      setSnapshot(provider.getSnapshot());
      setRealtimeStatus(provider.getStatus());
    });
    provider.start?.();
    setSnapshot(provider.getSnapshot());
    setRealtimeStatus(provider.getStatus());

    return () => {
      unsubscribe();
      provider.stop?.();
    };
  }, [config.feedbackPanelId, config.panelLatestMetricsUrl, isDemoMode, locationCode]);

  useEffect(() => {
    const heartbeatUrl = config.panelHeartbeatUrl;
    const feedbackPanelId = config.feedbackPanelId;
    if (!heartbeatUrl || typeof feedbackPanelId !== "number") {
      return;
    }

    let timer: number | null = null;
    let retryTimer: number | null = null;

    const clearRetry = (): void => {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const tick = (): void => {
      if (document.visibilityState !== "visible") {
        return;
      }
      clearRetry();
      void sendHeartbeat(heartbeatUrl, feedbackPanelId).then((delivered) => {
        if (delivered || timer === null) {
          return;
        }
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          if (document.visibilityState === "visible") {
            void sendHeartbeat(heartbeatUrl, feedbackPanelId);
          }
        }, HEARTBEAT_RETRY_DELAY_MS);
      });
    };

    const start = (): void => {
      if (timer !== null) {
        return;
      }
      tick();
      timer = window.setInterval(tick, HEARTBEAT_INTERVAL_MS);
    };

    const stop = (): void => {
      clearRetry();
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    const onVisibilityChange = (): void => {
      if (document.visibilityState === "visible") {
        start();
      } else {
        stop();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    if (document.visibilityState === "visible") {
      start();
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stop();
    };
  }, [config.panelHeartbeatUrl, config.feedbackPanelId]);

  useEffect(() => {
    if (model.screen !== "tier3") {
      return;
    }
    const timer = window.setTimeout(() => {
      dispatch({ type: "tier3Dismissed", config });
    }, config.thankYouResetMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [config, model.screen, config.thankYouResetMs]);

  const onPickRating = useCallback(
    async (rating: Rating): Promise<void> => {
      if (isSubmittingFeedback) {
        return;
      }

      const feedbackPanelId = config.feedbackPanelId;
      const shouldSubmitFeedback = (rating === "excellent" || rating === "good") && typeof feedbackPanelId === "number";
      if (shouldSubmitFeedback && typeof feedbackPanelId === "number") {
        setIsSubmittingFeedback(true);
        const deadline = createDeadline(INTERACTIVE_SUBMIT_DEADLINE_MS);
        try {
          await submitPositiveRatingFeedback(config, rating, { signal: deadline.signal });
        } catch (error: unknown) {
          if (error instanceof FeedbackSubmissionError && error.reason === "network_unavailable") {
            enqueueSubmission({
              feedbackPanelId,
              feedbackPanelItemsApiUrl: config.feedbackPanelItemsApiUrl,
              rating,
            });
            return;
          }
          if (error instanceof FeedbackSubmissionError && error.reason === "cooldown") {
            showToast("You need to wait 5 mins before submitting another feedback.");
            return;
          }
          showToast("Feedback submission failed. Please try again.");
          return;
        } finally {
          deadline.cancel();
          setIsSubmittingFeedback(false);
        }
      }
      dispatch({ type: "ratingSelected", rating });
    },
    [config, isSubmittingFeedback, showToast, enqueueSubmission],
  );

  const onToggleCategory = useCallback((categoryId: string): void => {
    dispatch({ type: "tier2CategoryToggled", categoryId });
  }, []);

  const onSubmitTier2Feedback = useCallback(async (): Promise<void> => {
    if (model.selectedTier2CategoryIds.length === 0 || isSubmittingFeedback) {
      return;
    }

    const submitRating: Rating = model.rating && isNegativePathRating(model.rating) ? model.rating : "poor";
    const feedbackPanelId = config.feedbackPanelId;
    setIsSubmittingFeedback(true);
    const deadline = createDeadline(INTERACTIVE_SUBMIT_DEADLINE_MS);
    try {
      await submitNegativeRatingFeedback(config, submitRating, model.selectedTier2CategoryIds, {
        signal: deadline.signal,
      });
      dispatch({ type: "tier2Submitted", rating: submitRating });
    } catch (error: unknown) {
      if (error instanceof FeedbackSubmissionError && error.reason === "network_unavailable" && typeof feedbackPanelId === "number") {
        enqueueSubmission({
          feedbackPanelId,
          feedbackPanelItemsApiUrl: config.feedbackPanelItemsApiUrl,
          rating: submitRating,
          selectedItemIds: model.selectedTier2CategoryIds,
        });
        dispatch({ type: "tier2Submitted", rating: submitRating });
        return;
      }
      if (error instanceof FeedbackSubmissionError && error.reason === "invalid_items") {
        showToast("Selected feedback items do not contain valid API item IDs.");
        return;
      }
      if (error instanceof FeedbackSubmissionError && error.reason === "cooldown") {
        showToast("You need to wait 5 mins before submitting another feedback.");
        return;
      }
      showToast("Feedback submission failed. Please try again.");
    } finally {
      deadline.cancel();
      setIsSubmittingFeedback(false);
    }
  }, [config, enqueueSubmission, isSubmittingFeedback, model.rating, model.selectedTier2CategoryIds, showToast]);

  const onDismissTier3 = useCallback((): void => {
    dispatch({ type: "tier3Dismissed", config });
  }, [config]);

  const onBackToTier1 = useCallback((): void => {
    dispatch({ type: "tier2BackToTier1", config });
  }, [config]);

  return {
    model,
    snapshot,
    tier1Ratings,
    tier2Items,
    isSubmittingFeedback,
    pendingSubmissionCount,
    realtimeStatus,
    backgroundImageUrl,
    logoImageUrl,
    toastMessage,
    onPickRating,
    onToggleCategory,
    onSubmitTier2Feedback,
    onDismissTier3,
    onBackToTier1,
  };
}
