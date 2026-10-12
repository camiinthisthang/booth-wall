import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MergeCelebrationOverlay } from "@/features/CaughtAtGate";

const baseline = {
  configured: true,
  count: 0,
  requiredChecks: ["quality"],
  problems: [],
  recentMerges: [
    {
      number: 1,
      title: "Baseline",
      mergedAt: "2026-10-12T10:00:00.000Z",
    },
  ],
};

describe("Merge celebration overlay", () => {
  let response = baseline;

  beforeEach(() => {
    vi.useFakeTimers();
    response = baseline;
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(response),
        } as Response),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("establishes a baseline, then celebrates every new merge", async () => {
    render(<MergeCelebrationOverlay />);
    await act(async () => undefined);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    response = {
      ...baseline,
      recentMerges: [
        {
          number: 2,
          title: "New merge",
          mergedAt: "2026-10-12T10:01:00.000Z",
        },
        ...baseline.recentMerges,
      ],
    };
    await act(async () => {
      vi.advanceTimersByTime(20_000);
      await Promise.resolve();
    });

    expect(
      screen.getByRole("status", { name: "Pull request 2 merged" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Merged #2")).toBeInTheDocument();
  });
});
