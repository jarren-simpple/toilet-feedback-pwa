import type { ComponentProps, ReactElement } from "react";
import type { Tier3Screen as SharedTier3Screen } from "../../../../../../features/feedback/components/Tier3Screen";
import { CertisStage } from "../../../../CertisStage";

/** Certis "03 Thank you" screen. Auto-reset timing is handled by the shared flow. */
export function Tier3Screen({ onDismiss }: ComponentProps<typeof SharedTier3Screen>): ReactElement {
  return (
    <CertisStage>
      <section className="certis-screen certis-thanks">
        <div className="certis-thanks-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="#2BA88E" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12.5 9.5 18 20 6.5" />
          </svg>
        </div>
        <h1 className="certis-title certis-title--thanks">Thank you for your feedback.</h1>
        <p className="certis-subhead certis-subhead--thanks">
          Our reception team has been notified. This screen resets in a moment.
        </p>
        <button type="button" className="certis-restart" onClick={onDismiss}>
          Start over
        </button>
      </section>
    </CertisStage>
  );
}
