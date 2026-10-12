import { describe, expect, it } from "vitest";
import {
  findCaughtProblems,
  requiredCheckContexts,
  unseenMergeEvents,
} from "@/lib/caught-at-gate";

describe("Caught at the Gate data", () => {
  it("reads exact required check names from repository rules", () => {
    expect(
      requiredCheckContexts([
        {
          type: "required_status_checks",
          parameters: {
            required_status_checks: [
              { context: "quality" },
              { context: "preview" },
            ],
          },
        },
        { type: "pull_request" },
      ]),
    ).toEqual(["preview", "quality"]);
  });

  it("counts a required failure followed by success before merge", () => {
    const problems = findCaughtProblems(
      [
        {
          number: 12,
          title: "Fix the wall",
          mergedAt: "2026-10-12T10:10:00.000Z",
          checks: [
            {
              name: "quality",
              conclusion: "failure",
              completedAt: "2026-10-12T10:00:00.000Z",
            },
            {
              name: "quality",
              conclusion: "success",
              completedAt: "2026-10-12T10:05:00.000Z",
            },
          ],
        },
      ],
      ["quality"],
    );

    expect(problems).toEqual([
      {
        pullNumber: 12,
        pullTitle: "Fix the wall",
        checkName: "quality",
        failedAt: "2026-10-12T10:00:00.000Z",
        fixedAt: "2026-10-12T10:05:00.000Z",
      },
    ]);
  });

  it("ignores optional checks and fixes after merge", () => {
    expect(
      findCaughtProblems(
        [
          {
            number: 12,
            title: "Fix the wall",
            mergedAt: "2026-10-12T10:10:00.000Z",
            checks: [
              {
                name: "optional",
                conclusion: "failure",
                completedAt: "2026-10-12T10:00:00.000Z",
              },
              {
                name: "optional",
                conclusion: "success",
                completedAt: "2026-10-12T10:05:00.000Z",
              },
              {
                name: "quality",
                conclusion: "failure",
                completedAt: "2026-10-12T10:00:00.000Z",
              },
              {
                name: "quality",
                conclusion: "success",
                completedAt: "2026-10-12T10:11:00.000Z",
              },
            ],
          },
        ],
        ["quality"],
      ),
    ).toEqual([]);
  });

  it("queues every merge not present in the previous baseline", () => {
    expect(
      unseenMergeEvents(["9:2026-10-12T10:00:00.000Z"], [
        {
          number: 11,
          title: "Third",
          mergedAt: "2026-10-12T10:02:00.000Z",
        },
        {
          number: 9,
          title: "First",
          mergedAt: "2026-10-12T10:00:00.000Z",
        },
        {
          number: 10,
          title: "Second",
          mergedAt: "2026-10-12T10:01:00.000Z",
        },
      ]),
    ).toEqual([
      {
        number: 10,
        title: "Second",
        mergedAt: "2026-10-12T10:01:00.000Z",
      },
      {
        number: 11,
        title: "Third",
        mergedAt: "2026-10-12T10:02:00.000Z",
      },
    ]);
  });
});
