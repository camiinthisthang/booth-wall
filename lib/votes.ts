import { Redis } from "@upstash/redis";

export interface VoteStore {
  addVote(issueId: string, voterId: string): Promise<boolean>;
  count(issueId: string): Promise<number>;
  clear(issueId: string): Promise<void>;
  getLastPromotion(): Promise<number | null>;
  setLastPromotion(timestamp: number): Promise<void>;
}

function votersKey(issueId: string) {
  return `booth:voters:${issueId}`;
}

class UpstashVoteStore implements VoteStore {
  constructor(private readonly redis: Redis) {}

  async addVote(issueId: string, voterId: string) {
    return (await this.redis.sadd(votersKey(issueId), voterId)) === 1;
  }
  async count(issueId: string) {
    return this.redis.scard(votersKey(issueId));
  }
  async clear(issueId: string) {
    await this.redis.del(votersKey(issueId));
  }
  async getLastPromotion() {
    const value = await this.redis.get<number>("booth:last-promotion");
    return value ?? null;
  }
  async setLastPromotion(timestamp: number) {
    await this.redis.set("booth:last-promotion", timestamp);
  }
}

class MemoryVoteStore implements VoteStore {
  private voters = new Map<string, Set<string>>();
  private lastPromotion: number | null = null;

  async addVote(issueId: string, voterId: string) {
    const voters = this.voters.get(issueId) ?? new Set<string>();
    const size = voters.size;
    voters.add(voterId);
    this.voters.set(issueId, voters);
    return voters.size > size;
  }
  async count(issueId: string) {
    return this.voters.get(issueId)?.size ?? 0;
  }
  async clear(issueId: string) {
    this.voters.delete(issueId);
  }
  async getLastPromotion() {
    return this.lastPromotion;
  }
  async setLastPromotion(timestamp: number) {
    this.lastPromotion = timestamp;
  }
}

const globalStores = globalThis as typeof globalThis & {
  __boothMemoryVotes?: MemoryVoteStore;
};

export function getVoteStore(): VoteStore {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) return new UpstashVoteStore(new Redis({ url, token }));
  globalStores.__boothMemoryVotes ??= new MemoryVoteStore();
  return globalStores.__boothMemoryVotes;
}

export function validateVoteInput(value: unknown):
  | { ok: true; issueId: string; voterId: string }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "A JSON body is required" };
  }
  const { issueId, voterId } = value as Record<string, unknown>;
  if (typeof issueId !== "string" || !/^[\w-]{1,80}$/.test(issueId)) {
    return { ok: false, error: "issueId is invalid" };
  }
  if (typeof voterId !== "string" || !/^[\w-]{8,100}$/.test(voterId)) {
    return { ok: false, error: "voterId is invalid" };
  }
  return { ok: true, issueId, voterId };
}
