import { describe, expect, it } from "vitest";
import {
  diffLines,
  mostRecentPull,
  ticketIdForPull,
} from "@/lib/live-diff";

const pull = (number: number, createdAt: string) => ({
  number,
  title: `BOOTH-${number}: Build the feature`,
  created_at: createdAt,
  changed_files: 1,
  head: { ref: `feat/BOOTH-${number}` },
});

describe("Live Diff data", () => {
  it("selects the pull request that opened most recently", () => {
    expect(
      mostRecentPull([
        pull(1, "2026-10-12T09:00:00.000Z"),
        pull(2, "2026-10-12T10:00:00.000Z"),
      ])?.number,
    ).toBe(2);
  });

  it("extracts a ticket ID from the branch or title", () => {
    expect(ticketIdForPull(pull(14, "2026-10-12T10:00:00.000Z"))).toBe(
      "BOOTH-14",
    );
  });

  it("classifies actual patch lines for syntax highlighting", () => {
    expect(
      diffLines([
        {
          filename: "app/page.tsx",
          status: "modified",
          patch: "@@ -1 +1 @@\n-old\n+new\n context",
        },
      ]),
    ).toEqual([
      { kind: "header", text: "MODIFIED app/page.tsx" },
      { kind: "header", text: "@@ -1 +1 @@" },
      { kind: "deletion", text: "-old" },
      { kind: "addition", text: "+new" },
      { kind: "context", text: " context" },
    ]);
  });

  it("labels files whose patch is omitted by GitHub", () => {
    expect(
      diffLines([{ filename: "public/logo.png", status: "added" }]),
    ).toEqual([
      { kind: "header", text: "ADDED public/logo.png" },
      {
        kind: "notice",
        text: "  Binary or large diff available on GitHub",
      },
    ]);
  });
});
