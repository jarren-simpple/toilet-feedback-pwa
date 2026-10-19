import { useState } from "react";
import type { ComponentProps, CSSProperties, ReactElement } from "react";
import type { Tier1Screen as SharedTier1Screen } from "../../../../../../features/feedback/components/Tier1Screen";
import { DEMO_LOCATION_CODE } from "../../../../../../entities/panel/demoConfig";
import type { Rating } from "../../../../../../shared/types/rating";
import { CertisStage } from "../../../../CertisStage";
import { RATING_COLOR, RatingFace } from "../../../../RatingFace";

/** Certis "01 Rate" screen. Same props and flow as the shared Tier 1; no sensor metrics or QR. */
export function Tier1Screen({
  snapshot,
  ratings,
  onPickRating,
}: ComponentProps<typeof SharedTier1Screen>): ReactElement {
  // Highlight the tapped card while a positive rating submits.
  const [picked, setPicked] = useState<Rating | null>(null);
  const locationLabel = snapshot.locationLabel.trim();

  const pick = (rating: Rating): void => {
    setPicked(rating);
    void onPickRating(rating).finally(() => setPicked(null));
  };

  return (
    <CertisStage>
      <section className="certis-screen certis-rate">
        {locationLabel !== "" && locationLabel !== DEMO_LOCATION_CODE && <div className="certis-kicker">{locationLabel}</div>}
        <h1 className="certis-title">Thanks for visiting us!</h1>
        <p className="certis-subhead">Please rate our service.</p>

        <div className="certis-ratings">
          {ratings.map((item) => (
            <button
              type="button"
              key={item.rating}
              className={picked === item.rating ? "certis-rating certis-rating--picked" : "certis-rating"}
              style={{ "--rating-color": RATING_COLOR[item.rating] } as CSSProperties}
              onClick={() => pick(item.rating)}
            >
              <RatingFace rating={item.rating} />
              <span className="certis-rating-label">{item.label}</span>
            </button>
          ))}
        </div>

        <p className="certis-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v.01M12 11v5" />
          </svg>
          <span>Your feedback is anonymous.</span>
        </p>
      </section>
    </CertisStage>
  );
}
