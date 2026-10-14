import { Redis } from "@upstash/redis";
import type { QrDesignKey } from "@/lib/qr-designs";

export interface ScanStore {
  recordScan(design: QrDesignKey, timestamp: number): Promise<number>;
  getScanTotal(timestamp: number): Promise<number>;
}

export function scanDayKey(timestamp: number | Date) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toISOString().slice(0, 10);
}

const TOTAL_PREFIX = "booth:scan-total:";
const DESIGN_PREFIX = "booth:scan-design:";
const EXPIRY_SECONDS = 3 * 24 * 60 * 60;
const RECORD_SCAN_SCRIPT = `
local total = redis.call("INCR", KEYS[1])
redis.call("EXPIRE", KEYS[1], ${EXPIRY_SECONDS})
redis.call("INCR", KEYS[2])
redis.call("EXPIRE", KEYS[2], ${EXPIRY_SECONDS})
return total
`;

class UpstashScanStore implements ScanStore {
  constructor(private readonly redis: Redis) {}

  async recordScan(design: QrDesignKey, timestamp: number) {
    const day = scanDayKey(timestamp);
    return this.redis.eval<string[], number>(
      RECORD_SCAN_SCRIPT,
      [`${TOTAL_PREFIX}${day}`, `${DESIGN_PREFIX}${day}:${design}`],
      [],
    );
  }

  async getScanTotal(timestamp: number) {
    return (
      (await this.redis.get<number>(
        `${TOTAL_PREFIX}${scanDayKey(timestamp)}`,
      )) ?? 0
    );
  }
}

class MemoryScanStore implements ScanStore {
  private totals = new Map<string, number>();
  private designs = new Map<string, number>();

  async recordScan(design: QrDesignKey, timestamp: number) {
    const day = scanDayKey(timestamp);
    const next = (this.totals.get(day) ?? 0) + 1;
    this.totals.set(day, next);
    const designKey = `${day}:${design}`;
    this.designs.set(designKey, (this.designs.get(designKey) ?? 0) + 1);
    return next;
  }

  async getScanTotal(timestamp: number) {
    return this.totals.get(scanDayKey(timestamp)) ?? 0;
  }
}

const globalStores = globalThis as typeof globalThis & {
  __boothMemoryScans?: MemoryScanStore;
};

export function redisConfigured() {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL) &&
      (process.env.UPSTASH_REDIS_REST_TOKEN ??
        process.env.KV_REST_API_TOKEN),
  );
}

export function getScanStore(): ScanStore {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) return new UpstashScanStore(new Redis({ url, token }));
  globalStores.__boothMemoryScans ??= new MemoryScanStore();
  return globalStores.__boothMemoryScans;
}
