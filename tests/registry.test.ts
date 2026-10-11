import { describe, expect, it } from "vitest";
import { featureRegistry } from "@/features/registry";

describe("feature registry", () => {
  it("contains isolated entries with stable unique keys and placements", () => {
    expect(featureRegistry).toHaveLength(12);
    expect(new Set(featureRegistry.map((feature) => feature.key)).size).toBe(12);
    for (const feature of featureRegistry) {
      expect(feature.title).not.toBe("");
      expect(feature.placement.column).not.toBe("");
      expect(feature.placement.row).not.toBe("");
      expect(typeof feature.Component).toBe("function");
    }
  });
});
