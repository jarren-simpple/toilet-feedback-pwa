import type { FeedbackItemConfig, FeedbackRatingConfig } from "./config";

export interface FeedbackPanelApiResponse {
  feedback_panel?: FeedbackPanelApiResponse | null;
  url?: string | null;
  qr_code?: string | null;
  id?: number;
  location_code?: string | null;
  location?: string | null;
  enable_ratings_feedback?: boolean | number;
  feedback_ratings?: FeedbackRatingConfig[];
  items?: FeedbackItemConfig[];
  logo?: string | null;
  secondary_logo?: string | null;
  custom_background_image?: string | null;
}

export type GateAuthFailureReason =
  | "no_endpoint"
  | "network_error"
  | "http_error"
  | "invalid_credentials"
  | "invalid_response";

export interface GateAuthResult {
  isValid: boolean;
  panelResponse: FeedbackPanelApiResponse | null;
  failureReason?: GateAuthFailureReason;
}
