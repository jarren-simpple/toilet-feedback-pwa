import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const appVersion = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"),
).version as string;

export default defineConfig({
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    VitePWA({
      // The SW still skips waiting and claims clients, but the page reload is ours to schedule
      // (src/shared/lib/serviceWorker.ts) so it never interrupts a visitor. Don't inject a second registration.
      registerType: "autoUpdate",
      injectRegister: false,
      includeManifestIcons: false,
      manifest: {
        name: "Toilet Feedback Panel",
        short_name: "Toilet Panel",
        description: "Restroom feedback kiosk",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "landscape",
        background_color: "#0d1f12",
        theme_color: "#0d1f12",
        lang: "en",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Take control of the already-open page as soon as the SW activates. Without this the
        // first load after install stays uncontrolled until a reload, so a kiosk that loses its
        // connection before then can't load anything it hasn't fetched yet (e.g. Tier 2 icons).
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ["**/*.{js,css,html,ico,png,jpg,svg,json}"],
        runtimeCaching: [
          {
            // Panel logo / custom background from S3 (or any other host). Serve from cache once
            // seen so they survive offline and show instantly; refreshed in the background.
            urlPattern: ({ request, sameOrigin }) => !sameOrigin && request.destination === "image",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "remote-panel-images",
              expiration: { maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 },
              // 0 = opaque response from a plain <img>/CSS fetch without CORS.
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
});
