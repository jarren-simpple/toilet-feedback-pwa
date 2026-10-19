# Toilet feedback panel (PWA)

This project delivers a **kiosk-style Progressive Web App** with three tiers:

1. **Tier 1** — Location (top-left), today’s footfall, temperature, humidity, and four rating actions.
2. **Tier 2** — Twelve improvement categories on a **single viewport** (6×2 grid on typical tablet landscape; reflows on narrow widths).
3. **Tier 3** — Thank you, then automatic return to Tier 1 (timer configurable).

Metrics can now be consumed from backend realtime APIs (SSE + snapshot fallback) using the panel-authenticated runtime
configuration.

## Requirements

- Node.js 18+ and npm.

## Architecture (entry → gate → tiers)

See **[`docs/application-flow.md`](docs/application-flow.md)** for the step-by-step path from **`index.html`** through **`bootstrap`**, **`RootApp`**, gate auth, **`useFeedbackFlow`**, realtime metrics, and feedback APIs—including which files own each concern.

## Scripts

```bash
npm install
npm run dev      # local dev server
npm run build    # typecheck + production build to dist/
npm run preview  # serve dist/ locally
npm test         # Vitest (tier navigation logic)
```

Deploy the contents of `**dist/**` to any HTTPS static host (S3, Netlify, nginx, etc.). PWAs require **HTTPS** (except `localhost`).

### Per-client builds

`npm run build` is the **BCA** build (`dist/`, existing S3 + CloudFront). Other clients build with their own mode
into their own folder and deploy to their own subdomain:

| Client | Build | Output | Host |
|---|---|---|---|
| BCA | `npm run build` | `dist/` | existing bucket / CloudFront |
| Certis | `npm run build:certis` | `dist-certis/` | `certis.pwafbp.simpple.app` |

`npm run dev:certis` / `npm run preview:certis` run that client locally. Client UI differences live in
[`src/clients/`](src/clients/README.md); names and theme colours in `clients.config.ts`.

## Configuration

The app now uses in-code defaults for kiosk/base settings and loads feedback panel items/ratings from backend API after successful gate login (`/api/feedback/getFeedbackPanelItems`).

Optional realtime env:

- `VITE_PANEL_STREAM_BASE_URL` (for example `http://ifsc.test`)

When set, the app derives:

- `{base}/api/panels/{panelId}/stream` (SSE)
- `{base}/api/panels/{panelId}/latest-metrics` (fallback snapshot)

If backend already returns `stream_url` and `latest_metrics_url` from gate auth payload, those are preferred.


## Viewport and layout

- For the **6×2** Tier 2 layout without reflow, target at least **~1100px width** in landscape (see plan: e.g. **1280×800** tablets).
- The app uses `overflow: hidden` on the document to discourage scrolling on kiosk displays.

## Android kiosk: install and lock

These steps vary slightly by device and Android version; verify on your hardware.

1. **Open the panel URL in Chrome** (must be HTTPS in production).
2. **Install the PWA**: Chrome menu → **Install app** / **Add to Home screen** (wording varies).
3. **Open the installed app** from the home screen (runs in standalone/fullscreen-style mode).
4. **Lock to this app** (pick one approach):
  - **Screen pinning**: Settings → Security (or Accessibility) → enable **Screen pinning**. Open the PWA, tap Overview (Recents), pin this app. To unpin, hold Back + Overview per device instructions.
  - **Dedicated device / kiosk** (recommended for production): use **Android Enterprise**, **Kiosk Launcher**, or MDM (Intune, Workspace ONE, etc.) to allow only the browser or this PWA.
5. **Disable sleep** and set **brightness** as needed for a wall-mounted panel.

## Redeploy workflow (no USB updates)

1. Change config or UI in git.
2. Run `npm run build`.
3. Upload `**dist/`** to your host (invalidate CDN cache if applicable).
4. On the tablet, **close and reopen** the installed PWA (or clear site data if you cache aggressively). Service worker updates are handled by the generated worker (`registerSW`); a refresh after deploy usually picks up a new version.

## Backend reference

See [`docs/realtime-sensor-workflow.md`](docs/realtime-sensor-workflow.md) for the backend contract, SSE event schema,
security rules, and rollout sequence.