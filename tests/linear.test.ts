import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBoothIssues,
  isCanceledLinearState,
  normalizeLinearState,
} from "@/lib/linear";

describe("Linear workflow normalization", () => {
  it.each([
    ["Triage", "triage", "Backlog"],
    ["Ready", "unstarted", "Todo"],
    ["Building", "started", "In Progress"],
    ["In Review", "started", "In Review"],
    ["Completed", "completed", "Done"],
  ])("maps %s to %s", (name, type, expected) => {
    expect(normalizeLinearState(name, type)).toBe(expected);
  });

  it("does not map canceled states to Done", () => {
    expect(normalizeLinearState("Canceled", "canceled")).not.toBe("Done");
  });

  it.each([
    ["Canceled", "canceled", true],
    ["Cancelled", "", true],
    ["Won't do", "canceled", true],
    ["Done", "completed", false],
    ["Blocked", "started", false],
    ["Backlog", "backlog", false],
  ])("treats %s (%s) as canceled: %s", (name, type, expected) => {
    expect(isCanceledLinearState(name, type)).toBe(expected);
  });
});

describe("Booth issues", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("hides canceled tickets from every lane", async () => {
    vi.stubEnv("LINEAR_API_KEY", "test-key");
    vi.stubEnv("LINEAR_TEAM_ID", "team");
    const node = (identifier: string, name: string, type: string) => ({
      id: identifier,
      identifier,
      title: `Ticket ${identifier}`,
      createdAt: "2026-10-14T00:00:00.000Z",
      updatedAt: "2026-10-14T00:00:00.000Z",
      state: { id: `${name}-id`, name, type },
      labels: { nodes: [] },
      assignee: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: {
            team: {
              issues: {
                nodes: [
                  node("BOOTH-1", "Done", "completed"),
                  node("BOOTH-2", "Canceled", "canceled"),
                  node("BOOTH-3", "In Progress", "started"),
                  node("BOOTH-4", "Backlog", "backlog"),
                ],
              },
            },
          },
        }),
      ),
    );

    const issues = await getBoothIssues();

    expect(issues.map((issue) => [issue.identifier, issue.state])).toEqual([
      ["BOOTH-1", "Done"],
      ["BOOTH-3", "In Progress"],
      ["BOOTH-4", "Backlog"],
    ]);
  });
});
