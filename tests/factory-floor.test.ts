import { describe, expect, it } from "vitest";
import {
  buildFactoryFloorEvents,
  stationForTicket,
} from "@/features/PixelMascot";
import type { TicketPullRequest } from "@/lib/github";
import type { BoothIssue, BoardLane } from "@/lib/linear";

function issue(state: BoardLane): BoothIssue {
  return {
    id: "linear-1",
    identifier: "BOOTH-12",
    title: "Build the Factory Floor",
    createdAt: "2026-10-11T09:00:00Z",
    updatedAt: "2026-10-11T10:00:00Z",
    state,
    stateId: "state-1",
    labels: [],
    assignee: "Factory Droid",
  };
}

function pull(
  state: TicketPullRequest["state"],
  checks: TicketPullRequest["checks"],
): TicketPullRequest {
  return {
    identifier: "BOOTH-12",
    number: 12,
    title: "BOOTH-12: Build the Factory Floor",
    url: "https://github.com/factory/booth/pull/12",
    state,
    checks,
    createdAt: "2026-10-11T10:10:00Z",
    updatedAt: "2026-10-11T10:20:00Z",
    mergedAt: state === "merged" ? "2026-10-11T10:30:00Z" : null,
  };
}

describe("Factory Floor pipeline", () => {
  it("maps real Linear and GitHub state to stations", () => {
    expect(stationForTicket(issue("Backlog"))).toBe("Backlog");
    expect(stationForTicket(issue("Todo"))).toBe("Todo");
    expect(stationForTicket(issue("In Progress"))).toBe("In Progress");
    expect(stationForTicket(issue("In Review"))).toBe("PR Open");
    expect(stationForTicket(issue("In Progress"), pull("open", "none"))).toBe(
      "PR Open",
    );
    expect(
      stationForTicket(issue("In Progress"), pull("open", "passed")),
    ).toBe("Checks");
    expect(
      stationForTicket(issue("In Review"), pull("merged", "none")),
    ).toBe("Merged");
    expect(stationForTicket(issue("Done"), pull("merged", "none"))).toBe(
      "Live",
    );
  });

  it("builds a newest-first event ticker", () => {
    const events = buildFactoryFloorEvents(
      [issue("In Progress")],
      [pull("open", "passed")],
    );
    expect(events.map((event) => event.text)).toEqual([
      "BOOTH-12 checks passed",
      "BOOTH-12 PR #12 opened",
      "BOOTH-12 claimed",
    ]);
  });
});
