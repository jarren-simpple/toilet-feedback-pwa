import type { CSSProperties, ReactElement } from "react";
import type { PanelConfig } from "../../../entities/panel/config";
import { ConnectionPing } from "../../../shared/ui/ConnectionPing";
import { LoadingOverlay } from "../../../shared/ui/LoadingOverlay";
import { Toast } from "../../../shared/ui/Toast";
import { Tier1Screen } from "./Tier1Screen";
import { Tier2Screen } from "./Tier2Screen";
import { Tier3Screen } from "./Tier3Screen";
import { useFeedbackFlow } from "../hooks/useFeedbackFlow";

interface FeedbackAppProps {
  config: PanelConfig;
  locationCode: string;
  /** Hides Reload so the hidden tap gesture stays the only interactive affordance. */
  isDemoMode?: boolean;
}

export function FeedbackApp({ config, locationCode, isDemoMode = false }: FeedbackAppProps): ReactElement {
  const {
    model,
    snapshot,
    realtimeStatus,
    tier1Ratings,
    tier2Items,
    isSubmittingFeedback,
    backgroundImageUrl,
    logoImageUrl,
    toastMessage,
    onPickRating,
    onToggleCategory,
    onSubmitTier2Feedback,
    onDismissTier3,
    onBackToTier1,
  } = useFeedbackFlow(config, locationCode, isDemoMode);

  const isTier2 = model.screen === "tier2";
  const backgroundStyle = backgroundImageUrl
    ? ({ "--panel-bg-image": `url("${backgroundImageUrl}")` } as CSSProperties)
    : undefined;

  return (
    <>
      <div className="shell">
        <div className={isTier2 ? "bg bg-tier2" : "bg"} style={backgroundStyle} />
        {model.screen === "tier1" && (
          <Tier1Screen
            config={config}
            snapshot={snapshot}
            realtimeStatus={realtimeStatus}
            ratings={tier1Ratings}
            logoImageUrl={logoImageUrl}
            onPickRating={onPickRating}
          />
        )}
        {model.screen === "tier2" && (
          <Tier2Screen
            categories={tier2Items}
            selectedCategoryIds={model.selectedTier2CategoryIds}
            isSubmittingFeedback={isSubmittingFeedback}
            onToggleCategory={onToggleCategory}
            onSubmitFeedback={onSubmitTier2Feedback}
            onBackToTier1={config.enableRatingsFeedback === true ? onBackToTier1 : undefined}
          />
        )}
        {model.screen === "tier3" && <Tier3Screen resetMs={config.thankYouResetMs} onDismiss={onDismissTier3} />}
      </div>
      <LoadingOverlay isVisible={isSubmittingFeedback} text="Submitting feedback..." />
      <Toast message={toastMessage} />
      <ConnectionPing />
      {isDemoMode && (
        <span className="demo-badge" aria-hidden="true">
          Demo
        </span>
      )}
      {!isDemoMode && (
        <button
          type="button"
          className="reload-btn"
          aria-label="Reload panel items"
          onClick={() => window.location.reload()}
        >
          <img src="/reload.png" alt="" aria-hidden="true" className="reload-btn-icon" />
        </button>
      )}
    </>
  );
}
