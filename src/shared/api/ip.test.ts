import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAST_IP_STORAGE_KEY, getCurrentIpv4Address } from "./ip";

class MemoryStorage {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

function stubIpify(result: "ok" | "unreachable"): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (): Promise<Response> => {
    if (result === "unreachable") {
      throw new Error("network down");
    }
    return { ok: true, json: () => Promise.resolve({ ip: "203.0.113.9" }) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function storeIp(ip: string, ageMs: number): void {
  localStorage.setItem(LAST_IP_STORAGE_KEY, JSON.stringify({ ip, fetchedAt: Date.now() - ageMs }));
}

describe("getCurrentIpv4Address", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("looks the IP up and caches it", async () => {
    const fetchMock = stubIpify("ok");
    await expect(getCurrentIpv4Address()).resolves.toBe("203.0.113.9");
    await expect(getCurrentIpv4Address()).resolves.toBe("203.0.113.9");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips the network entirely while the cached IP is fresh", async () => {
    const fetchMock = stubIpify("ok");
    storeIp("198.51.100.1", 60_000);
    await expect(getCurrentIpv4Address()).resolves.toBe("198.51.100.1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to an older cached IP when the lookup fails", async () => {
    stubIpify("unreachable");
    storeIp("198.51.100.1", 2 * 60 * 60 * 1000);
    await expect(getCurrentIpv4Address()).resolves.toBe("198.51.100.1");
  });

  it("returns null when the lookup fails and the cache is too old", async () => {
    stubIpify("unreachable");
    storeIp("198.51.100.1", 2 * 24 * 60 * 60 * 1000);
    await expect(getCurrentIpv4Address()).resolves.toBeNull();
  });
});
