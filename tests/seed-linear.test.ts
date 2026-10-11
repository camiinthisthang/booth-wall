import { describe, expect, it, vi } from "vitest";
import { seedLinear } from "@/scripts/seed-linear";

describe("Linear seeding", () => {
  it("skips tickets whose stable marker already exists", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        team: {
          id: "team",
          issues: {
            nodes: [{ description: "<!-- booth-seed:animated-wordmark -->" }],
          },
        },
      })
      .mockResolvedValue({ issueCreate: { success: true } });
    const result = await seedLinear(request, "team");
    expect(result).toEqual({ created: 19, skipped: 1 });
    expect(request).toHaveBeenCalledTimes(20);
  });
});
