import type { FeedbackItemConfig, PanelConfig } from "./config";
import type { FeedbackPanelApiResponse } from "./types";

export function mapPanelResponseToConfigPatch(data: FeedbackPanelApiResponse | null): Partial<PanelConfig> {
  const panel = extractFeedbackPanelPayload(data);
  if (!data || !panel) {
    return {};
  }

  const patch: Partial<PanelConfig> = {};
  if (typeof panel.id === "number") {
    patch.feedbackPanelId = panel.id;
  }
  if (typeof panel.enable_ratings_feedback !== "undefined") {
    patch.enableRatingsFeedback = Boolean(panel.enable_ratings_feedback);
  }

  const feedbackRatings = Array.isArray(data.feedback_ratings)
    ? data.feedback_ratings
    : Array.isArray(panel.feedback_ratings)
      ? panel.feedback_ratings
      : undefined;
  if (feedbackRatings) {
    patch.feedbackRatings = feedbackRatings;
  }
  const feedbackItems = mapFeedbackPanelItems(panel.items);
  if (feedbackItems.length > 0) {
    patch.feedbackItems = feedbackItems;
  }
  if (typeof data.url === "string" && data.url.trim() !== "") {
    patch.resourceUrl = data.url.trim();
  }
  if (typeof data.qr_code === "string" && data.qr_code.trim() !== "") {
    patch.qrCodeBase64 = data.qr_code.trim();
  }
  const logoImage = pickNonEmptyString(panel.logo) ?? pickNonEmptyString(data.logo);
  if (logoImage) {
    patch.logoImage = logoImage;
  }
  const secondaryLogoImage = pickNonEmptyString(panel.secondary_logo) ?? pickNonEmptyString(data.secondary_logo);
  if (secondaryLogoImage) {
    patch.secondaryLogoImage = secondaryLogoImage;
  }
  const customBackgroundImage =
    pickNonEmptyString(panel.custom_background_image) ?? pickNonEmptyString(data.custom_background_image);
  if (customBackgroundImage) {
    patch.customBackgroundImage = customBackgroundImage;
  }
  return patch;
}

function mapFeedbackPanelItems(items: unknown): FeedbackItemConfig[] {
  if (!Array.isArray(items)) {
    return [];
  }
  const out: FeedbackItemConfig[] = [];
  for (const raw of items) {
    const mapped = mapSingleFeedbackPanelItem(raw);
    if (mapped) {
      out.push(mapped);
    }
  }
  return out;
}

function mapSingleFeedbackPanelItem(raw: unknown): FeedbackItemConfig | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "number" ? row.id : Number(row.id);
  if (!Number.isFinite(id)) {
    return null;
  }
  const name =
    typeof row.name === "string"
      ? row.name
      : typeof row.label === "string"
        ? row.label
        : "";
  const image =
    pickNonEmptyString(row.image) ??
    pickNonEmptyString(row.image_url) ??
    pickNonEmptyString(row.image_path);

  return { id, name, image };
}

function pickNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function extractFeedbackPanelPayload(data: FeedbackPanelApiResponse | null): FeedbackPanelApiResponse | null {
  if (!data) {
    return null;
  }
  if (data.feedback_panel && typeof data.feedback_panel === "object") {
    return data.feedback_panel;
  }
  return data;
}
