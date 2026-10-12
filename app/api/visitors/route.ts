import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";

const ACTIVE_WINDOW_MS = 2 * 60 * 1000;
const MAX_MEMORY_SESSIONS = 10_000;
const VISITORS_KEY = "booth:visitors:active";

interface VisitorStore {
  touch(sessionHash: string, now: number): Promise<void>;
  count(now: number): Promise<number>;
  remove(sessionHash: string): Promise<void>;
}

class UpstashVisitorStore implements VisitorStore {
  constructor(private readonly redis: Redis) {}

  async touch(sessionHash: string, now: number) {
    await this.redis
      .pipeline()
      .zadd(VISITORS_KEY, { score: now, member: sessionHash })
      .zremrangebyscore(VISITORS_KEY, 0, now - ACTIVE_WINDOW_MS)
      .pexpire(VISITORS_KEY, ACTIVE_WINDOW_MS)
      .exec();
  }
  async count(now: number) {
    await this.redis.zremrangebyscore(VISITORS_KEY, 0, now - ACTIVE_WINDOW_MS);
    return this.redis.zcard(VISITORS_KEY);
  }
  async remove(sessionHash: string) {
    await this.redis.zrem(VISITORS_KEY, sessionHash);
  }
}

class MemoryVisitorStore implements VisitorStore {
  // Re-inserting on every touch keeps Map insertion order equal to last-seen
  // order, so the stalest sessions are always at the front.
  private lastSeen = new Map<string, number>();

  private prune(now: number) {
    for (const [hash, seenAt] of this.lastSeen) {
      if (now - seenAt <= ACTIVE_WINDOW_MS) break;
      this.lastSeen.delete(hash);
    }
  }
  async touch(sessionHash: string, now: number) {
    this.prune(now);
    this.lastSeen.delete(sessionHash);
    this.lastSeen.set(sessionHash, now);
    while (this.lastSeen.size > MAX_MEMORY_SESSIONS) {
      const stalest = this.lastSeen.keys().next().value;
      if (stalest === undefined) break;
      this.lastSeen.delete(stalest);
    }
  }
  async count(now: number) {
    this.prune(now);
    return this.lastSeen.size;
  }
  async remove(sessionHash: string) {
    this.lastSeen.delete(sessionHash);
  }
}

const globalStores = globalThis as typeof globalThis & {
  __boothMemoryVisitors?: MemoryVisitorStore;
};

function getVisitorStore(): VisitorStore {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) return new UpstashVisitorStore(new Redis({ url, token }));
  globalStores.__boothMemoryVisitors ??= new MemoryVisitorStore();
  return globalStores.__boothMemoryVisitors;
}

// Only a one-way hash of a random client-generated token is stored, never the
// token itself, an IP address, a user agent, or any other request metadata.
function hashSession(sessionId: string) {
  return createHash("sha256")
    .update(`booth-visitor:${sessionId}`)
    .digest("base64url")
    .slice(0, 22);
}

async function readSessionId(request: Request): Promise<string | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;
  const { sessionId } = body as Record<string, unknown>;
  if (typeof sessionId !== "string" || !/^[\w-]{16,100}$/.test(sessionId)) {
    return null;
  }
  return sessionId;
}

function visitorsResponse(count: number, init?: ResponseInit) {
  return Response.json(
    {
      count,
      approximate: true,
      activeWindowSeconds: ACTIVE_WINDOW_MS / 1000,
    },
    {
      ...init,
      headers: { "Cache-Control": "no-store", ...init?.headers },
    },
  );
}

function unavailable() {
  return Response.json(
    { error: "The visitor count is temporarily unavailable" },
    { status: 502, headers: { "Cache-Control": "no-store" } },
  );
}

function invalidSession() {
  return Response.json(
    { error: "sessionId must be a random 16-100 character token" },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  try {
    return visitorsResponse(await getVisitorStore().count(Date.now()));
  } catch {
    return unavailable();
  }
}

export async function POST(request: Request) {
  const sessionId = await readSessionId(request);
  if (!sessionId) return invalidSession();
  try {
    const store = getVisitorStore();
    const now = Date.now();
    await store.touch(hashSession(sessionId), now);
    return visitorsResponse(await store.count(now));
  } catch {
    return unavailable();
  }
}

export async function DELETE(request: Request) {
  const sessionId = await readSessionId(request);
  if (!sessionId) return invalidSession();
  try {
    const store = getVisitorStore();
    await store.remove(hashSession(sessionId));
    return visitorsResponse(await store.count(Date.now()));
  } catch {
    return unavailable();
  }
}
