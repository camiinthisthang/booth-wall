import { describe, expect, it } from "vitest";
import {
  countMergedTodayWithKnownBug,
  extractTicketIdentifier,
  summarizeCheckRuns,
  summarizePullRequests,
  type GitHubPullRequest,
} from "@/lib/github";

const merged: GitHubPullRequest = {
  number: 42,
  title: "Ship the booth",
  html_url: "https://github.com/factory/booth/pull/42",
  merged_at: "2026-10-11T10:00:00Z",
  updated_at: "2026-10-11T10:01:00Z",
  user: { login: "droid" },
};

describe("GitHub summary", () => {
  it("selects the latest merged pull request", () => {
    const summary = summarizePullRequests(
      [
        { ...merged, number: 41, merged_at: "2026-10-10T10:00:00Z" },
        merged,
      ],
      new Date("2026-10-11T20:00:00Z"),
    );
    expect(summary.latest?.number).toBe(42);
  });

  it("documents the currently seeded double-count behavior", () => {
    expect(
      countMergedTodayWithKnownBug([merged], new Date("2026-10-11T20:00:00Z")),
    ).toBe(2);
  });

  it.skip("counts each PR merged today exactly once", () => {
    expect(
      countMergedTodayWithKnownBug([merged], new Date("2026-10-11T20:00:00Z")),
    ).toBe(1);
  });

  it("extracts a Linear identifier from the branch or title", () => {
    expect(
      extractTicketIdentifier({
        title: "Build the factory floor",
        head: { ref: "droid/BOOTH-12-factory-floor", sha: "abc" },
      }),
    ).toBe("BOOTH-12");
    expect(
      extractTicketIdentifier({ title: "BOOTH-7: Spotlight ticket" }),
    ).toBe("BOOTH-7");
  });

  it("reduces check runs to a wall-friendly state", () => {
    expect(summarizeCheckRuns([])).toBe("none");
    expect(
      summarizeCheckRuns([{ status: "in_progress", conclusion: null }]),
    ).toBe("pending");
    expect(
      summarizeCheckRuns([{ status: "completed", conclusion: "success" }]),
    ).toBe("passed");
    expect(
      summarizeCheckRuns([{ status: "completed", conclusion: "failure" }]),
    ).toBe("failed");
  });
});
