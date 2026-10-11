import { describe, expect, it, vi } from "vitest";
import {
  promoteAndReset,
  selectPromotionCandidate,
} from "@/lib/promotion";

const candidates = [
  { id: "b", identifier: "BOOTH-2", createdAt: "2026-02-01T00:00:00Z", votes: 4 },
  { id: "c", identifier: "BOOTH-3", createdAt: "2026-01-01T00:00:00Z", votes: 4 },
  { id: "a", identifier: "BOOTH-1", createdAt: "2026-01-01T00:00:00Z", votes: 4 },
];

describe("promotion", () => {
  it("uses votes, oldest creation date, then issue ID", () => {
    expect(selectPromotionCandidate(candidates)?.id).toBe("a");
    expect(selectPromotionCandidate([{ ...candidates[0], votes: 0 }])).toBeNull();
  });

  it("clears only after the Linear mutation succeeds", async () => {
    const calls: string[] = [];
    await promoteAndReset(
      candidates[0],
      async (id) => void calls.push(`promote:${id}`),
      async (id) => void calls.push(`reset:${id}`),
    );
    expect(calls).toEqual(["promote:b", "reset:b"]);

    const reset = vi.fn();
    await expect(
      promoteAndReset(candidates[0], async () => {
        throw new Error("Linear failed");
      }, reset),
    ).rejects.toThrow("Linear failed");
    expect(reset).not.toHaveBeenCalled();
  });
});
