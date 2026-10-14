import { afterEach, describe, expect, it, vi } from "vitest";
import {
  factoryRedirectUrl,
  isQrDesign,
  scanUrl,
} from "@/lib/qr-designs";
import { getScanStore, scanDayKey } from "@/lib/scans";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("scan tracking", () => {
  it("uses exact UTC calendar days", () => {
    expect(scanDayKey(Date.parse("2026-10-13T23:59:59.999Z"))).toBe(
      "2026-10-13",
    );
    expect(scanDayKey(Date.parse("2026-10-14T00:00:00.000Z"))).toBe(
      "2026-10-14",
    );
  });

  it("counts every scan in the current day total", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    const store = getScanStore();
    const timestamp = Date.parse("2098-04-23T16:30:00.000Z");
    const before = await store.getScanTotal(timestamp);

    expect(await store.recordScan("terrain", timestamp)).toBe(before + 1);
    expect(await store.recordScan("detected", timestamp)).toBe(before + 2);
    expect(await store.getScanTotal(timestamp)).toBe(before + 2);
  });

  it("builds allowlisted scan and Factory destination URLs", () => {
    expect(isQrDesign("session")).toBe(true);
    expect(isQrDesign("../session")).toBe(false);
    expect(scanUrl("https://example.com/wall", "session")).toBe(
      "https://example.com/go/session",
    );
    expect(factoryRedirectUrl("session").toString()).toBe(
      "https://app.factory.ai/?utm_source=booth&utm_content=session",
    );
  });
});
