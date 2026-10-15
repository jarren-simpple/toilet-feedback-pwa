/**
 * Service worker registration that never reloads the page in front of a visitor.
 *
 * The SW is still built in `autoUpdate` mode (skipWaiting + clientsClaim), so kiosks already
 * running an older SW keep picking up updates without needing new client code. What changes is
 * the page side: `virtual:pwa-register` reloads the moment a new SW activates, possibly mid-
 * feedback. Here the reload is deferred until the panel has been idle on its first screen.
 *
 * The page has already loaded its whole JS bundle by then, so running the old page against the
 * new SW until that reload is safe; `public/` assets keep the same URLs across versions.
 */

/** Check for a new version this often; a kiosk never navigates, so it would otherwise never look. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** How long with no touches before an update may reload the page. */
const IDLE_BEFORE_RELOAD_MS = 60 * 1000;
const RELOAD_CHECK_INTERVAL_MS = 15 * 1000;

let reloadGuard: (() => boolean) | null = null;
let lastInteractionAt = Date.now();
let reloadPending = false;

/**
 * Lets the mounted screen veto the update reload (e.g. while a visitor is mid-flow). With no
 * guard registered (gate or loading screen) only the idle timer applies.
 */
export function setReloadGuard(guard: (() => boolean) | null): void {
  reloadGuard = guard;
}

function markInteraction(): void {
  lastInteractionAt = Date.now();
}

function tryReload(): void {
  if (!reloadPending) {
    return;
  }
  if (Date.now() - lastInteractionAt < IDLE_BEFORE_RELOAD_MS) {
    return;
  }
  if (reloadGuard && !reloadGuard()) {
    return;
  }
  reloadPending = false;
  window.location.reload();
}

export async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const { Workbox } = await import("workbox-window");
  const wb = new Workbox(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });

  wb.addEventListener("activated", (event) => {
    if (event.isUpdate || event.isExternal) {
      reloadPending = true;
      tryReload();
    }
  });

  for (const type of ["pointerdown", "keydown"] as const) {
    document.addEventListener(type, markInteraction, { passive: true, capture: true });
  }
  window.setInterval(tryReload, RELOAD_CHECK_INTERVAL_MS);

  try {
    await wb.register({ immediate: true });
  } catch {
    // Registration retries on the next load; the app runs fine without a SW, just not offline.
    return;
  }

  window.setInterval(() => {
    if (navigator.onLine === false) {
      return;
    }
    // A failed check on a weak link is harmless; the next interval tries again.
    void wb.update().catch(() => undefined);
  }, UPDATE_CHECK_INTERVAL_MS);
}
