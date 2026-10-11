import { describe, expect, it } from "vitest";
import { normalizeLinearState } from "@/lib/linear";

describe("Linear workflow normalization", () => {
  it.each([
    ["Triage", "triage", "Backlog"],
    ["Ready", "unstarted", "Todo"],
    ["Building", "started", "In Progress"],
    ["In Review", "started", "In Review"],
    ["Completed", "completed", "Done"],
    ["Canceled", "canceled", "Done"],
  ])("maps %s to %s", (name, type, expected) => {
    expect(normalizeLinearState(name, type)).toBe(expected);
  });
});
