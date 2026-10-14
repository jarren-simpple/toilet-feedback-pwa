import { readLocalStorageItem, writeLocalStorageItem } from "../lib/browserStorage";
import { runWithTimeout } from "../lib/timeout";

export const LAST_IP_STORAGE_KEY = "simpple-feedback-last-ip";

const IP_LOOKUP_TIMEOUT_MS = 4_000;
/** A kiosk's public IP rarely changes; skip the third-party lookup entirely while the cached one is this fresh. */
const IP_FRESH_FOR_MS = 30 * 60 * 1000;
/** Past this age the cached IP is still used, but only as a fallback when a fresh lookup fails. */
const IP_FALLBACK_FOR_MS = 24 * 60 * 60 * 1000;

interface CachedIp {
  ip: string;
  fetchedAt: number;
}

/**
 * The kiosk's public IPv4. Looked up from ipify at most every {@link IP_FRESH_FOR_MS}; on a weak
 * link the extra third-party round-trip on every submit tripled latency and failure odds, and
 * an unreachable ipify used to fail every submission even when our own API was reachable.
 */
export async function getCurrentIpv4Address(signal?: AbortSignal): Promise<string | null> {
  const cached = readCachedIp();
  const now = Date.now();
  if (cached && now - cached.fetchedAt < IP_FRESH_FOR_MS) {
    return cached.ip;
  }

  const fresh = await getIpv4FromIpify(signal);
  if (fresh) {
    writeLocalStorageItem(LAST_IP_STORAGE_KEY, JSON.stringify({ ip: fresh, fetchedAt: now } satisfies CachedIp));
    return fresh;
  }

  if (cached && now - cached.fetchedAt < IP_FALLBACK_FOR_MS) {
    return cached.ip;
  }
  return null;
}

function readCachedIp(): CachedIp | null {
  const raw = readLocalStorageItem(LAST_IP_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const data = JSON.parse(raw) as Partial<CachedIp>;
    if (typeof data.ip !== "string" || !isIpv4Address(data.ip) || typeof data.fetchedAt !== "number") {
      return null;
    }
    return { ip: data.ip, fetchedAt: data.fetchedAt };
  } catch {
    return null;
  }
}

function isIpv4Address(value: string): boolean {
  const match = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) {
    return false;
  }
  return match.slice(1).every((part) => {
    const num = Number(part);
    return Number.isInteger(num) && num >= 0 && num <= 255;
  });
}

async function getIpv4FromIpify(signal?: AbortSignal): Promise<string | null> {
  try {
    return await runWithTimeout(
      IP_LOOKUP_TIMEOUT_MS,
      async (timeoutSignal) => {
        const response = await fetch("https://api.ipify.org?format=json", { signal: timeoutSignal, cache: "no-store" });
        if (!response.ok) {
          return null;
        }
        const data = (await response.json()) as { ip?: unknown };
        if (typeof data.ip !== "string") {
          return null;
        }
        const ip = data.ip.trim();
        return isIpv4Address(ip) ? ip : null;
      },
      signal,
    );
  } catch {
    return null;
  }
}
