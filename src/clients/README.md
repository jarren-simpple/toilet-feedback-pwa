# Per-client builds

Each client gets its own build and subdomain (e.g. `certis.pwafbp.simpple.app`). The shared app in `src/`
is the base; a client folder only holds what that client changes. BCA is the default build (`npm run build` →
`dist/`) and has no folder here.

```
src/clients/<client>/
  overrides/<same path as under src/>   replaces that file in this client's build
  public/<file>                         replaces / adds a file from the shared public/
```

Examples:

| Want to change | Put the file at |
|---|---|
| Colours, fonts, spacing | `overrides/shared/styles/client.css` (loaded after the shared CSS) |
| Tier 1 layout / HTML | `overrides/features/feedback/components/Tier1Screen.tsx` |
| Logo, favicon, PWA icons, faces | `public/favicon.svg`, `public/pwa-512x512.png`, `public/good_face.png`, … |
| App name / theme colour | `clients.config.ts` (repo root) |

An override must export the same names as the file it replaces (e.g. `export function Tier1Screen`).
Imports from inside `src/clients/` always reach the shared original, so an override can wrap it:

```tsx
import { Tier3Screen as SharedTier3Screen } from "../../../../../../features/feedback/components/Tier3Screen";
```

## Adding a client

1. Add an entry to `CLIENTS` in `clients.config.ts` (`outDir: "dist-<client>"`).
2. Add `dev:<client>` / `build:<client>` / `preview:<client>` scripts to `package.json` (`--mode <client>`).
3. Optional: `.env.<client>` for client-specific `VITE_*` values (overrides `.env`).
4. Create `src/clients/<client>/` with only the files that differ.
