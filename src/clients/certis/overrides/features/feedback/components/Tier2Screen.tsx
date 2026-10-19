import type { ComponentProps, ReactElement } from "react";
import type { Tier2Screen as SharedTier2Screen } from "../../../../../../features/feedback/components/Tier2Screen";
import { CertisStage } from "../../../../CertisStage";

/** Certis "02 Areas for improvement" screen. Items come from the panel API, as for BCA. */
export function Tier2Screen({
  categories,
  selectedCategoryIds,
  isSubmittingFeedback,
  onToggleCategory,
  onSubmitFeedback,
  onBackToTier1,
}: ComponentProps<typeof SharedTier2Screen>): ReactElement {
  const canSubmit = selectedCategoryIds.length > 0 && !isSubmittingFeedback;

  return (
    <CertisStage>
      <section className="certis-screen certis-issues">
        <div className="certis-kicker">Areas for improvement</div>
        <h1 className="certis-title certis-title--issues">What needs attention?</h1>
        <p className="certis-subhead certis-subhead--issues">Pick as many as you like.</p>

        <div className="certis-chips">
          {categories.length === 0 ? (
            <p className="certis-subhead" role="status">
              No items available.
            </p>
          ) : (
            categories.map((item) => {
              const isOn = selectedCategoryIds.includes(item.id);
              return (
                <button
                  type="button"
                  key={item.id}
                  className={isOn ? "certis-chip certis-chip--on" : "certis-chip"}
                  data-category={item.id}
                  aria-pressed={isOn}
                  onClick={() => onToggleCategory(item.id)}
                >
                  {isOn && (
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 12.5 9.5 18 20 6.5" />
                    </svg>
                  )}
                  <span>{item.label}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="certis-actions">
          <button
            type="button"
            className="certis-cta"
            disabled={!canSubmit}
            onClick={() => void onSubmitFeedback()}
          >
            {isSubmittingFeedback ? "Submitting..." : "Submit feedback"}
          </button>
          {/* A neutral/poor rating can't be sent without an item, so Skip returns to the start unsent. */}
          {onBackToTier1 && (
            <button type="button" className="certis-skip" onClick={onBackToTier1}>
              Skip
            </button>
          )}
        </div>
      </section>
    </CertisStage>
  );
}
