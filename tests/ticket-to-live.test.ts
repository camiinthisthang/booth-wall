import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTicketToLiveMetrics,
  getTicketToLiveMetrics,
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

describe("Ticket to Live data", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("leaves canceled tickets out of today's stats", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-12T12:00:00.000Z"));
    vi.stubEnv("LINEAR_API_KEY", "test-key");
    vi.stubEnv("LINEAR_TEAM_ID", "team");
    vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");

    const issue = (identifier: string, name: string, type: string) => ({
      id: identifier,
      identifier,
      title: `Build ${identifier}`,
      state: { name, type },
    });
    const pull = (identifier: string) => ({
      number: Number(identifier.split("-")[1]),
      title: `${identifier}: Build it`,
      merged_at: "2026-10-12T09:00:00.000Z",
      merge_commit_sha: `sha-${identifier}`,
      head: { ref: `droid/${identifier}` },
    });
    const deployedAt: Record<string, string> = {
      "BOOTH-5": "2026-10-12T09:01:00.000Z",
      "BOOTH-6": "2026-10-12T09:03:00.000Z",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "https://api.linear.app/graphql") {
          const { query } = JSON.parse(String(init?.body));
          if (query.includes("TicketTimelines")) {
            return Response.json({
              data: {
                team: {
                  issues: {
                    nodes: [
                      issue("BOOTH-5", "Canceled", "canceled"),
                      issue("BOOTH-6", "Done", "completed"),
                    ],
                  },
                },
              },
            });
          }
          return Response.json({
            data: {
              issue: {
                history: {
                  nodes: [
                    {
                      createdAt: "2026-10-12T09:00:00.000Z",
                      toState: { name: "In Progress", type: "started" },
                    },
                  ],
                },
              },
            },
          });
        }
        if (url.includes("/pulls?")) {
          return Response.json([pull("BOOTH-5"), pull("BOOTH-6")]);
        }
        if (url.includes("/deployments?")) {
          return Response.json(
            Object.keys(deployedAt).map((identifier) => ({
              sha: `sha-${identifier}`,
              statuses_url: `https://api.github.com/statuses/${identifier}`,
            })),
          );
        }
        const identifier = url.match(/statuses\/(BOOTH-\d+)/)?.[1] ?? "";
        return Response.json([
          { state: "success", created_at: deployedAt[identifier] },
        ]);
      }),
    );

    const metrics = await getTicketToLiveMetrics();

    expect(metrics.current?.identifier).toBe("BOOTH-6");
    expect(metrics.fastestMs).toBe(180_000);
    expect(metrics.medianMs).toBe(180_000);
  });
});
