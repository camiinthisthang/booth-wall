import { describe, expect, it } from "vitest";
import {
  buildFactoryFloorEvents,
  detailForTicket,
  featureIndexForTicket,
  machineForTicket,
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
    files: ["features/PixelMascot.tsx"],
    commits: ["Build the pixel assembly line"],
    checkNames: ["quality"],
  };
}

describe("Factory Floor pipeline", () => {
  it("maps real Linear and GitHub state to assembly machines", () => {
    expect(machineForTicket(issue("Backlog"))).toBe("intake");
    expect(machineForTicket(issue("Todo"))).toBe("intake");
    expect(machineForTicket(issue("In Progress"))).toBe("workbench");
    expect(machineForTicket(issue("In Review"))).toBe("review");
    expect(machineForTicket(issue("In Progress"), pull("open", "none"))).toBe(
      "review",
    );
    expect(
      machineForTicket(issue("In Progress"), pull("open", "pending")),
    ).toBe("test");
    expect(
      machineForTicket(issue("In Progress"), pull("open", "failed")),
    ).toBe("workbench");
    expect(
      machineForTicket(issue("In Review"), pull("merged", "none")),
    ).toBe("launch");
    expect(machineForTicket(issue("Done"), pull("merged", "none"))).toBe(
      "launch",
    );
  });

  it("uses real PR file data for Workbench speech", () => {
    expect(detailForTicket(issue("In Progress"), pull("open", "pending"))).toBe(
      "Changing PixelMascot.tsx",
    );
  });

  it("maps seeded feature tickets to their wall tiles", () => {
    expect(featureIndexForTicket("BOOTH-1")).toBe(0);
    expect(featureIndexForTicket("BOOTH-12")).toBe(11);
    expect(featureIndexForTicket("BOOTH-20")).toBeUndefined();
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
