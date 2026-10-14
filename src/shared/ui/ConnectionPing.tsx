import type { ReactElement } from "react";
import { useConnectionStatus, type ConnectionStatus } from "../lib/connectionStatus";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  checking: "Checking connection...",
  online: "Connected",
  slow: "Slow connection",
  offline: "No connection",
};

interface ConnectionPingProps {
  /** URL on the API host to ping. Falls back to a same-origin asset when omitted. */
  pingUrl?: string;
}

/** Fixed top-right dot that pings the API host on an interval to confirm the kiosk can actually reach it. */
export function ConnectionPing({ pingUrl }: ConnectionPingProps): ReactElement {
  const status = useConnectionStatus(pingUrl);

  return (
    <div className={`connection-ping connection-ping-${status}`} title={STATUS_LABEL[status]} aria-hidden="true">
      <span className="connection-ping-dot" />
    </div>
  );
}
