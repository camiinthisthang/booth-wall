import { Redis } from "@upstash/redis";
import {
  MAX_VOTE_EVENTS,
  newestVoteEvents,
  parseVoteEvents,
  sanitizeScreenName,
  type VoteEvent,
  voteDayKey,
} from "@/lib/vote-events";

export interface VoteStore {
  addVote(issueId: string, voterId: string): Promise<boolean>;
  addVoteEvent(
    issueId: string,
    voterId: string,
    event: VoteEvent,
  ): Promise<{ accepted: boolean; count: number }>;
  recordEvent(event: VoteEvent): Promise<void>;
  getEvents(): Promise<VoteEvent[]>;
  getVoteTotal(timestamp: number): Promise<number>;
  count(issueId: string): Promise<number>;
  clear(issueId: string): Promise<void>;
  getLastPromotion(): Promise<number | null>;
  setLastPromotion(timestamp: number): Promise<void>;
}

function votersKey(issueId: string) {
  return `booth:voters:${issueId}`;
}

const EVENTS_KEY = "booth:vote-events";
const VOTE_TOTAL_PREFIX = "booth:vote-total:";
const ADD_VOTE_EVENT_SCRIPT = `
local accepted = redis.call("SADD", KEYS[1], ARGV[1])
if accepted == 1 then
  redis.call("LPUSH", KEYS[2], ARGV[2])
  redis.call("LTRIM", KEYS[2], 0, ${MAX_VOTE_EVENTS - 1})
  redis.call("INCR", KEYS[3])
  redis.call("EXPIRE", KEYS[3], 259200)
end
local count = redis.call("SCARD", KEYS[1])
return {accepted, count}
`;

class UpstashVoteStore implements VoteStore {
  constructor(private readonly redis: Redis) {}

  async addVote(issueId: string, voterId: string) {
    return (await this.redis.sadd(votersKey(issueId), voterId)) === 1;
  }
  async addVoteEvent(issueId: string, voterId: string, event: VoteEvent) {
    const result = await this.redis.eval<
      [string, string],
      [number, number]
    >(
      ADD_VOTE_EVENT_SCRIPT,
      [
        votersKey(issueId),
        EVENTS_KEY,
        `${VOTE_TOTAL_PREFIX}${voteDayKey(new Date(event.timestamp))}`,
      ],
      [voterId, JSON.stringify(event)],
    );
    return { accepted: result[0] === 1, count: result[1] };
  }
  async recordEvent(event: VoteEvent) {
    await this.redis.lpush(EVENTS_KEY, JSON.stringify(event));
    await this.redis.ltrim(EVENTS_KEY, 0, MAX_VOTE_EVENTS - 1);
  }
  async getEvents() {
    const values = await this.redis.lrange<unknown>(EVENTS_KEY, 0, -1);
    return parseVoteEvents(values);
  }
  async getVoteTotal(timestamp: number) {
    return (
      (await this.redis.get<number>(
        `${VOTE_TOTAL_PREFIX}${voteDayKey(timestamp)}`,
      )) ?? 0
    );
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
  private events: VoteEvent[] = [];
  private dailyTotals = new Map<string, number>();
  private lastPromotion: number | null = null;

  async addVote(issueId: string, voterId: string) {
    const voters = this.voters.get(issueId) ?? new Set<string>();
    const size = voters.size;
    voters.add(voterId);
    this.voters.set(issueId, voters);
    return voters.size > size;
  }
  async addVoteEvent(issueId: string, voterId: string, event: VoteEvent) {
    const accepted = await this.addVote(issueId, voterId);
    if (accepted) {
      this.events = newestVoteEvents([event, ...this.events]);
      const day = voteDayKey(new Date(event.timestamp));
      this.dailyTotals.set(day, (this.dailyTotals.get(day) ?? 0) + 1);
    }
    return { accepted, count: await this.count(issueId) };
  }
  async recordEvent(event: VoteEvent) {
    this.events = newestVoteEvents([event, ...this.events]);
  }
  async getEvents() {
    return newestVoteEvents(this.events);
  }
  async getVoteTotal(timestamp: number) {
    return this.dailyTotals.get(voteDayKey(timestamp)) ?? 0;
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
  | { ok: true; issueId: string; voterId: string; screenName: string }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "A JSON body is required" };
  }
  const { issueId, voterId, screenName } = value as Record<string, unknown>;
  if (typeof issueId !== "string" || !/^[\w-]{1,80}$/.test(issueId)) {
    return { ok: false, error: "issueId is invalid" };
  }
  if (typeof voterId !== "string" || !/^[\w-]{8,100}$/.test(voterId)) {
    return { ok: false, error: "voterId is invalid" };
  }
  if (screenName !== undefined && typeof screenName !== "string") {
    return { ok: false, error: "screenName is invalid" };
  }
  if (typeof screenName === "string" && [...screenName].length > 20) {
    return { ok: false, error: "screenName must be 20 characters or fewer" };
  }
  return {
    ok: true,
    issueId,
    voterId,
    screenName: sanitizeScreenName(screenName ?? ""),
  };
}
