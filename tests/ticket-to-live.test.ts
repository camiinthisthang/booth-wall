import { describe, expect, it } from "vitest";
import {
  buildTicketToLiveMetrics,
  median,
  startedAtFromHistory,
  type TicketTimeline,
} from "@/lib/ticket-to-live";

const ticket = (
  identifier: string,
  state: TicketTimeline["state"],
  startedAt: string,
): TicketTimeline => ({
  identifier,
  title: `Build ${identifier}`,
  state,
  startedAt,
});

describe("Ticket to Live metrics", () => {
  it("uses the first transition into In Progress", () => {
    expect(
      startedAtFromHistory([
        {
          createdAt: "2026-10-12T10:00:00.000Z",
          toState: { name: "In Progress", type: "started" },
        },
        {
          createdAt: "2026-10-12T09:00:00.000Z",
          toState: { name: "Todo", type: "unstarted" },
        },
        {
          createdAt: "2026-10-12T09:30:00.000Z",
          toState: { name: "In Progress", type: "started" },
        },
      ]),
    ).toBe("2026-10-12T09:30:00.000Z");
  });

  it("calculates exact odd and even medians", () => {
    expect(median([])).toBeNull();
    expect(median([30_000, 10_000, 20_000])).toBe(20_000);
    expect(median([40_000, 10_000, 20_000, 30_000])).toBe(25_000);
  });

  it("keeps a running ticket live and calculates today's deployment stats", () => {
    const metrics = buildTicketToLiveMetrics(
      [
        ticket("BOOTH-1", "Done", "2026-10-12T09:00:00.000Z"),
        ticket("BOOTH-2", "Done", "2026-10-12T10:00:00.000Z"),
        ticket("BOOTH-3", "In Progress", "2026-10-12T11:00:00.000Z"),
      ],
      [
        {
          identifier: "BOOTH-1",
          deployedAt: "2026-10-12T09:02:00.000Z",
        },
        {
          identifier: "BOOTH-2",
          deployedAt: "2026-10-12T10:04:00.000Z",
        },
      ],
      new Date("2026-10-12T12:00:00.000Z"),
    );

    expect(metrics.current).toMatchObject({
      identifier: "BOOTH-3",
      completedAt: null,
      durationMs: null,
    });
    expect(metrics.fastestMs).toBe(120_000);
    expect(metrics.medianMs).toBe(180_000);
  });

  it("freezes on the latest production deployment when no ticket is running", () => {
    const metrics = buildTicketToLiveMetrics(
      [ticket("BOOTH-1", "Done", "2026-10-12T09:00:00.000Z")],
      [
        {
          identifier: "BOOTH-1",
          deployedAt: "2026-10-12T09:02:30.000Z",
        },
      ],
      new Date("2026-10-12T12:00:00.000Z"),
    );

    expect(metrics.current).toMatchObject({
      identifier: "BOOTH-1",
      completedAt: "2026-10-12T09:02:30.000Z",
      durationMs: 150_000,
    });
  });
});
