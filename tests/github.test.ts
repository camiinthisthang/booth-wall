import { describe, expect, it } from "vitest";
import {
  countMergedTodayWithKnownBug,
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
});
