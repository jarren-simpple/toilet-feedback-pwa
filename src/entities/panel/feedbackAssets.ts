import type { FeedbackItem } from "../feedback/items";
import type { FeedbackItemConfig, FeedbackRatingConfig, PanelConfig } from "./config";
import type { Rating } from "../../shared/types/rating";

export interface Tier1RatingRow {
  rating: Rating;
  label: string;
  imageUrl: string | null;
  emojiFallback: string;
}

const EMOJI_BY_RATING: Record<Rating, string> = {
  excellent: "😍",
  good: "🙂",
  neutral: "😐",
  poor: "☹️",
};

const LOCAL_RATING_IMAGE_BY_RATING: Record<Rating, string> = {
  excellent: "/awesome_face.png",
  good: "/good_face.png",
  neutral: "/neutral_face.png",
  poor: "/sad_face.png",
};

const LOCAL_TIER2_ICONS: ReadonlyArray<{ label: string; iconSrc: string }> = [
  { label: "Dirty Wall", iconSrc: "/icon-dirty-wall.png" },
  { label: "Dirty WC", iconSrc: "/icon-dirty-wc.png" },
  { label: "Dirty Basin/ Mirror", iconSrc: "/icon-dirty-basin.png" },
  { label: "Dirty Cubicle", iconSrc: "/icon-dirty-cubicle.png" },
  { label: "Wet Floor", iconSrc: "/icon-wet-floor.png" },
  { label: "Smelly", iconSrc: "/icon-smelly.png" },
  { label: "Toilet Roll Empty", iconSrc: "/icon-toilet-roll-empty.png" },
  { label: "Soap Empty", iconSrc: "/icon-soap-empty.png" },
  { label: "Sanitary Bin Full", iconSrc: "/icon-sanitary-bin-full.png" },
  { label: "Faulty Water Fixture", iconSrc: "/icon-faulty-water-fixture.png" },
  { label: "Faulty Soap Dispenser", iconSrc: "/icon-soap-dispenser-faulty.png" },
  { label: "Faulty Light", iconSrc: "/icon-faulty-lights.png" },
];

const DEFAULT_TIER2_ICON = "/icon-dirty-wc.png";

function normalizeResourceBaseUrl(base: string): string {
  return base.trim().replace(/\/+$/, "");
}

/** S3 (or CDN) origin for relative `image` paths from the feedback panel API. Required env: `VITE_AWS_RESOURCE_BASE_URL`. */
export function getAwsResourceBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_AWS_RESOURCE_BASE_URL;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") {
    return normalizeResourceBaseUrl(fromEnv);
  }
  const message =
    "VITE_AWS_RESOURCE_BASE_URL is missing or empty. Add it to .env (see .env.example) and restart the dev server.";
  console.error(`[toilet-feedback-pwa] ${message}`);
  throw new Error(message);
}

/**
 * Resolves a panel asset path from getFeedbackPanelItems: absolute URLs are returned as-is;
 * relative paths are joined to {@link getAwsResourceBaseUrl}.
 */
export function resolveResourceImageUrl(imagePath: string | null | undefined): string | null {
  if (imagePath == null) {
    return null;
  }
  const trimmed = String(imagePath).trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const base = getAwsResourceBaseUrl();
  const suffix = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${suffix}`;
}

export function apiRatingToRating(apiRating: number): Rating | null {
  switch (apiRating) {
    case 4:
      return "excellent";
    case 3:
      return "good";
    case 2:
      return "neutral";
    case 1:
      return "poor";
    default:
      return null;
  }
}

export function buildTier1RatingRows(config: PanelConfig): Tier1RatingRow[] {
  if (config.enableRatingsFeedback !== true) {
    return [];
  }

  const list = config.feedbackRatings;
  if (!list?.length) {
    return [];
  }

  const sorted = [...list]
    .filter((ratingRow: FeedbackRatingConfig) => ratingRow.active !== 0)
    .sort((left, right) => right.rating - left.rating);

  const rows: Tier1RatingRow[] = [];
  for (const row of sorted) {
    const rating = apiRatingToRating(row.rating);
    if (!rating) {
      continue;
    }
    rows.push({
      rating,
      label: row.caption,
      imageUrl: LOCAL_RATING_IMAGE_BY_RATING[rating],
      emojiFallback: EMOJI_BY_RATING[rating],
    });
  }

  return rows;
}

export function buildTier2Items(config: PanelConfig): FeedbackItem[] {
  const items = config.feedbackItems;
  if (!items?.length) {
    return [];
  }

  const feedbackItems: FeedbackItem[] = [];
  for (const item of items) {
    const feedbackItem = toFeedbackItem(item);
    if (feedbackItem) {
      feedbackItems.push(feedbackItem);
    }
  }

  return feedbackItems;
}

export function localTier2IconByName(name: string): string {
  const normalized = name.trim().toLowerCase();
  const matched = LOCAL_TIER2_ICONS.find((icon) => icon.label.toLowerCase() === normalized);
  return matched?.iconSrc ?? DEFAULT_TIER2_ICON;
}

function toFeedbackItem(item: FeedbackItemConfig): FeedbackItem | null {
  return {
    id: String(item.id),
    label: item.name,
    iconSrc: localTier2IconByName(item.name),
  };
}
