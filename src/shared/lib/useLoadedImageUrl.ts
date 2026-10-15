import { useEffect, useState } from "react";

const RETRY_DELAY_MS = 60_000;

/**
 * Returns `url` only once the image has actually downloaded, and `null` until then or if it
 * fails. Lets callers keep a bundled fallback in place on a weak link instead of showing a blank
 * area or a broken-image icon. A failed load is retried when the browser reports it's back
 * online, and otherwise every minute.
 */
export function useLoadedImageUrl(url: string | null): string | null {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setLoadedUrl(null);
      return;
    }

    let cancelled = false;
    let retryTimer: number | null = null;
    let image: HTMLImageElement | null = null;

    const clearRetry = (): void => {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const load = (): void => {
      clearRetry();
      image = new Image();
      image.onload = () => {
        if (!cancelled) {
          setLoadedUrl(url);
        }
      };
      image.onerror = () => {
        if (!cancelled) {
          retryTimer = window.setTimeout(load, RETRY_DELAY_MS);
        }
      };
      image.src = url;
    };

    const onOnline = (): void => {
      if (retryTimer !== null) {
        load();
      }
    };

    load();
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      clearRetry();
      window.removeEventListener("online", onOnline);
      if (image) {
        image.onload = null;
        image.onerror = null;
      }
    };
  }, [url]);

  return url && loadedUrl === url ? loadedUrl : null;
}
