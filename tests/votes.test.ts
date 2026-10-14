import { describe, expect, it } from "vitest";
import { getVoteStore, validateVoteInput } from "@/lib/votes";

describe("votes", () => {
  it("validates issue and voter identifiers", () => {
    expect(validateVoteInput(null).ok).toBe(false);
    expect(validateVoteInput({ issueId: "../bad", voterId: "short" }).ok).toBe(false);
    expect(
      validateVoteInput({
        issueId: "2ba25d37-issue",
        voterId: "724ebfc4-6bdf-4ff5-82bf-5ced6bb96ab0",
      }).ok,
    ).toBe(true);
  });

  it("counts a browser only once per issue", async () => {
    const store = getVoteStore();
    const issueId = `test-${crypto.randomUUID()}`;
    expect(await store.addVote(issueId, "browser-0001")).toBe(true);
    expect(await store.addVote(issueId, "browser-0001")).toBe(false);
    expect(await store.addVote(issueId, "browser-0002")).toBe(true);
    expect(await store.count(issueId)).toBe(2);
  });

  it("records one event and one daily total for an accepted vote", async () => {
    const store = getVoteStore();
    const issueId = `event-test-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    const first = await store.addVoteEvent(issueId, "browser-1001", {
      id: `vote-${issueId}`,
      type: "vote",
      name: "maya",
      ticketId: "BOOTH-21",
      ticketTitle: "Night Shift",
      timestamp,
    });
    const duplicate = await store.addVoteEvent(issueId, "browser-1001", {
      id: `duplicate-${issueId}`,
      type: "vote",
      name: "maya",
      ticketId: "BOOTH-21",
      ticketTitle: "Night Shift",
      timestamp,
    });

    expect(first).toEqual({ accepted: true, count: 1 });
    expect(duplicate).toEqual({ accepted: false, count: 1 });
    expect(
      (await store.getEvents()).filter((event) => event.ticketId === "BOOTH-21"),
    ).toContainEqual(expect.objectContaining({ id: `vote-${issueId}` }));
    expect(await store.getVoteTotal(new Date(timestamp).getTime())).toBeGreaterThan(
      0,
    );
  });
});
