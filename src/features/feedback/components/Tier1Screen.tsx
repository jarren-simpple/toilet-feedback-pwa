import type { ReactElement } from "react";
import { MetricCard } from "../../../shared/ui/MetricCard";
import type { PanelConfig } from "../../../entities/panel/config";
import type { Tier1RatingRow } from "../../../entities/panel/feedbackAssets";
import type { PanelState } from "../../../shared/types/panelState";
import type { RealtimeStatus } from "../../../entities/panel/realtime";
import type { Rating } from "../../../shared/types/rating";

interface Tier1ScreenProps {
  config: PanelConfig;
  snapshot: PanelState;
  realtimeStatus: RealtimeStatus;
  ratings: Tier1RatingRow[];
  logoImageUrl?: string | null;
  isDemoMode?: boolean;
  onPickRating: (rating: Rating) => Promise<void>;
}

export function Tier1Screen({
  config,
  snapshot,
  realtimeStatus,
  ratings,
  logoImageUrl,
  isDemoMode = false,
  onPickRating,
}: Tier1ScreenProps): ReactElement {
  const locationLabel =
    snapshot.locationLabel.trim() === "" ? "N/A" : snapshot.locationLabel;

  return (
    <div className="tier1">
      <div className="location">{locationLabel}</div>
      <div className="tier1-main">
        <aside className="sidebar">
          <MetricCard
            title="Today’s Footfall"
            value={formatMetric(snapshot.footfall)}
            iconSrc="/icon-footfall.png"
          />
          <MetricCard
            title="Temperature"
            value={formatMetric(snapshot.temperatureC, "°C")}
            iconSrc="/icon-temperature.png"
          />
          <MetricCard
            title="Humidity"
            value={formatMetric(snapshot.humidityPct, "%")}
            iconSrc="/icon-humidity.png"
          />
        </aside>
        <div className="glass-panel tier1-panel">
          <div className="brand" aria-hidden="true">
            {logoImageUrl ? <img className="brand-logo" src={logoImageUrl} alt="" /> : null}
          </div>
          <p className="sanitise-note">
            {buildRealtimeLabel(realtimeStatus, snapshot.updatedAt)}
          </p>
          <div className="tier1-panel-content">
            <p className="greeting">{`${timeOfDayGreeting()} Please rate our toilet!`}</p>
            <div className="ratings">
              {ratings.map((item) => (
                <button
                  type="button"
                  className="rating-btn"
                  key={item.rating}
                  onClick={() => void onPickRating(item.rating)}
                >
                  {item.imageUrl ? (
                    <img
                      className="rating-face"
                      src={item.imageUrl}
                      alt=""
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="rating-face">{item.emojiFallback}</span>
                  )}
                  <span className="rating-label">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
          {!isDemoMode && (
            <div className="qr-row">
              {config.qrCodeBase64 ? (
                <img
                  src={`data:image/png;base64,${config.qrCodeBase64}`}
                  alt="QR code"
                  className="qr-placeholder qr-image"
                />
              ) : (
                <div
                  className="qr-placeholder"
                  role="img"
                  aria-label="QR code placeholder"
                />
              )}
            </div>
          )}
          <p className="sanitise-note">The screen is sanitised regularly.</p>
        </div>
      </div>
    </div>
  );
}

function buildRealtimeLabel(status: RealtimeStatus, updatedAt: string): string {
  if (status === "live") {
    return `Live data • Updated ${formatUpdatedAt(updatedAt)}`;
  }
  if (status === "stale") {
    return `Data stale • Last update ${formatUpdatedAt(updatedAt)}`;
  }
  if (status === "error") {
    return "Live data unavailable";
  }
  return "Loading sensor data...";
}

function formatUpdatedAt(updatedAt: string): string {
  if (!updatedAt || updatedAt === "N/A") {
    return "N/A";
  }
  const asDate = new Date(updatedAt);
  if (Number.isNaN(asDate.getTime())) {
    return updatedAt;
  }
  return asDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) {
    return "Good morning!";
  }
  if (hour < 18) {
    return "Good afternoon!";
  }
  return "Good evening!";
}

function formatMetric(value: number | null, suffix = ""): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  return `${value}${suffix}`;
}
