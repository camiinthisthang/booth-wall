import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCREEN_NAME,
  filterProfanity,
  formatVoteEvent,
  newestVoteEvents,
  sanitizeScreenName,
  type VoteEvent,
} from "@/lib/vote-events";

describe("vote event helpers", () => {
  it("filters profanity without changing innocent names", () => {
    expect(filterProfanity("Shit Happens")).toBe("**** Happens");
    expect(filterProfanity("classic")).toBe("classic");
    expect(filterProfanity("Scunthorpe")).toBe("Scunthorpe");
    expect(sanitizeScreenName("   ")).toBe(DEFAULT_SCREEN_NAME);
    expect(sanitizeScreenName("  maya   rivera  ")).toBe("maya rivera");
  });

  it("sorts newest first and retains the latest 50 events", () => {
    const events: VoteEvent[] = Array.from({ length: 52 }, (_, index) => ({
      id: `event-${String(index).padStart(2, "0")}`,
      type: "vote",
      name: "maya",
      ticketId: "BOOTH-21",
      ticketTitle: "Night Shift",
      timestamp: new Date(Date.UTC(2026, 9, 13, 0, 0, index)).toISOString(),
    }));

    const newest = newestVoteEvents(events);
    expect(newest).toHaveLength(50);
    expect(newest[0].id).toBe("event-51");
    expect(newest.at(-1)?.id).toBe("event-02");
  });

  it("formats vote ages and promotion highlights from event timestamps", () => {
    const timestamp = "2026-10-13T12:00:00.000Z";
    expect(
      formatVoteEvent(
        {
          id: "vote-1",
          type: "vote",
          name: "maya",
          ticketId: "BOOTH-21",
          ticketTitle: "Night Shift",
          timestamp,
        },
        new Date("2026-10-13T12:00:12.000Z").getTime(),
      ),
    ).toBe("maya voted for Night Shift · 12s ago");
    expect(
      formatVoteEvent(
        {
          id: "promotion-1",
          type: "promotion",
          ticketId: "BOOTH-21",
          ticketTitle: "Night Shift",
          timestamp,
        },
        new Date("2026-10-13T12:00:12.000Z").getTime(),
      ),
    ).toBe("Night Shift is next on the floor.");
  });
});
