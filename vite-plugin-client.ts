import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { normalizePath } from "vite";
import type { Plugin } from "vite";
import type { ClientConfig } from "./clients.config";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

function isInside(file: string, dir: string): boolean {
  const rel = path.relative(dir, file);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/**
 * Applies `src/clients/<client>/` on top of the shared app:
 * - `overrides/<path under src>` replaces that source file (component, CSS, …) for this client.
 *   Imports made from inside `src/clients/` always get the shared original, so an override can
 *   wrap or re-export it.
 * - `public/` files are served/emitted on top of the shared `public/` (same name wins).
 * - Sets the HTML <title> and theme-color from clients.config.ts.
 */
export function clientPlugin(client: string, config: ClientConfig, root: string): Plugin {
  const srcDir = path.resolve(root, "src");
  const clientsDir = path.join(srcDir, "clients");
  const overridesDir = path.join(clientsDir, client, "overrides");
  const publicDir = path.join(clientsDir, client, "public");
  const hasOverrides = existsSync(overridesDir);
  const hasPublic = existsSync(publicDir);

  return {
    name: "client-overrides",
    enforce: "pre",

    async resolveId(source, importer, options) {
      if (!hasOverrides || !importer || isInside(importer, clientsDir)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || resolved.external) return null;
      const [file, query] = resolved.id.split("?");
      if (!isInside(file, srcDir)) return null;
      const override = path.join(overridesDir, path.relative(srcDir, file));
      if (!existsSync(override)) return null;
      return normalizePath(override) + (query ? `?${query}` : "");
    },

    transformIndexHtml(html) {
      return html
        .replace(/<title>.*?<\/title>/, `<title>${config.name}</title>`)
        .replace(
          /(<meta name="theme-color" content=")[^"]*(")/,
          `$1${config.themeColor}$2`,
        );
    },

    configureServer(server) {
      if (!hasPublic) return;
      server.middlewares.use((req, res, next) => {
        const urlPath = decodeURIComponent((req.url ?? "").split("?")[0]);
        const file = path.join(publicDir, urlPath);
        if (!isInside(file, publicDir) || !existsSync(file) || !statSync(file).isFile()) {
          next();
          return;
        }
        const type = CONTENT_TYPES[path.extname(file).toLowerCase()];
        if (type) res.setHeader("Content-Type", type);
        res.end(readFileSync(file));
      });
    },

    generateBundle() {
      if (!hasPublic) return;
      for (const file of listFiles(publicDir)) {
        this.emitFile({
          type: "asset",
          fileName: normalizePath(path.relative(publicDir, file)),
          source: readFileSync(file),
        });
      }
    },
  };
}
