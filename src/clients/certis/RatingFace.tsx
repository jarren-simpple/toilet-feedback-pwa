import type { ReactElement } from "react";
import type { Rating } from "../../shared/types/rating";

export const RATING_COLOR: Record<Rating, string> = {
  excellent: "#2BA88E",
  good: "#3D74C9",
  neutral: "#E0A32B",
  poor: "#D14343",
};

export function RatingFace({ rating }: { rating: Rating }): ReactElement {
  const color = RATING_COLOR[rating];
  const eyes =
    rating === "excellent" ? (
      <>
        <path d="M14 20c1.6-2.4 4.4-2.4 6 0" />
        <path d="M28 20c1.6-2.4 4.4-2.4 6 0" />
      </>
    ) : (
      <>
        <circle cx="17" cy="20" r="2.1" fill={color} stroke="none" />
        <circle cx="31" cy="20" r="2.1" fill={color} stroke="none" />
      </>
    );
  const mouth = {
    excellent: "M14 28c2.6 5 17.4 5 20 0",
    good: "M15.5 28c3 4 14 4 17 0",
    neutral: "M16 29h16",
    poor: "M16 31c3-4.4 14-4.4 17 0",
  }[rating];

  return (
    <svg
      className="certis-face"
      viewBox="0 0 48 48"
      fill="none"
      stroke={color}
      strokeWidth="2.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="20" />
      {eyes}
      <path d={mouth} />
    </svg>
  );
}
