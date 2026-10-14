export const DEFAULT_SCREEN_NAME = "Anonymous visitor";
export const MAX_SCREEN_NAME_LENGTH = 20;
export const MAX_VOTE_EVENTS = 50;

export type VoteEvent =
  | {
      id: string;
      type: "vote";
      name: string;
      ticketId: string;
      ticketTitle: string;
      timestamp: string;
    }
  | {
      id: string;
      type: "promotion";
      ticketId: string;
      ticketTitle: string;
      timestamp: string;
    };

const PROFANITY = [
  "asshole",
  "bastard",
  "bitch",
  "bullshit",
  "cunt",
  "dick",
  "fuck",
  "motherfucker",
  "piss",
  "shit",
  "slut",
  "whore",
] as const;

const profanityPattern = new RegExp(`\\b(?:${PROFANITY.join("|")})\\b`, "gi");

export function filterProfanity(value: string): string {
  return value.replace(profanityPattern, (match) => "*".repeat(match.length));
}

export function sanitizeScreenName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return DEFAULT_SCREEN_NAME;
  return [...filterProfanity(normalized)]
    .slice(0, MAX_SCREEN_NAME_LENGTH)
    .join("");
}

export function newestVoteEvents(
  events: VoteEvent[],
  limit = MAX_VOTE_EVENTS,
): VoteEvent[] {
  return [...events]
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime() ||
        b.id.localeCompare(a.id),
    )
    .slice(0, limit);
}

export function formatVoteEvent(event: VoteEvent, now: number): string {
  if (event.type === "promotion") {
    return `${event.ticketTitle} is next on the floor.`;
  }
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - new Date(event.timestamp).getTime()) / 1000),
  );
  const age =
    elapsedSeconds < 60
      ? `${elapsedSeconds}s`
      : elapsedSeconds < 3_600
        ? `${Math.floor(elapsedSeconds / 60)}m`
        : `${Math.floor(elapsedSeconds / 3_600)}h`;
  return `${event.name} voted for ${event.ticketTitle} · ${age} ago`;
}

export function voteDayKey(timestamp: number | Date): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toISOString().slice(0, 10);
}

export function parseVoteEvents(values: unknown[]): VoteEvent[] {
  const events = values.flatMap((value) => {
    try {
      const parsed =
        typeof value === "string" ? JSON.parse(value) : value;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof parsed.id !== "string" ||
        typeof parsed.ticketId !== "string" ||
        typeof parsed.ticketTitle !== "string" ||
        typeof parsed.timestamp !== "string" ||
        !Number.isFinite(new Date(parsed.timestamp).getTime())
      ) {
        return [];
      }
      if (
        parsed.type === "vote" &&
        typeof parsed.name === "string"
      ) {
        return [parsed as VoteEvent];
      }
      if (parsed.type === "promotion") {
        return [parsed as VoteEvent];
      }
      return [];
    } catch {
      return [];
    }
  });
  return newestVoteEvents(events);
}
