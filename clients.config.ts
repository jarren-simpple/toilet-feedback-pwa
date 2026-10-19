/**
 * One build per client, picked with `vite --mode <client>` / `vite build --mode <client>`.
 * Any other mode (plain `npm run build` / `npm run dev`) is BCA, which keeps the original
 * `dist/` output so its existing S3 bucket + CloudFront setup doesn't change.
 *
 * Per-client UI lives in `src/clients/<client>/` (see src/clients/README.md).
 */
export interface ClientConfig {
  /** Build output folder. */
  outDir: string;
  /** PWA manifest + <title>. */
  name: string;
  shortName: string;
  description: string;
  /** PWA manifest + <meta name="theme-color">. */
  themeColor: string;
  backgroundColor: string;
}

export const DEFAULT_CLIENT = "bca";

export const CLIENTS: Record<string, ClientConfig> = {
  bca: {
    outDir: "dist",
    name: "Toilet Feedback Panel",
    shortName: "Toilet Panel",
    description: "Restroom feedback kiosk",
    themeColor: "#0d1f12",
    backgroundColor: "#0d1f12",
  },
  // certis.pwafbp.simpple.app
  certis: {
    outDir: "dist-certis",
    name: "Certis Feedback Panel",
    shortName: "Certis Panel",
    description: "Reception feedback kiosk",
    themeColor: "#FBF7F4",
    backgroundColor: "#FBF7F4",
  },
};

export function resolveClient(mode: string): string {
  return Object.prototype.hasOwnProperty.call(CLIENTS, mode) ? mode : DEFAULT_CLIENT;
}
