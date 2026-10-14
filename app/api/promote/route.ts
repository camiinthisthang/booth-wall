import { createHash } from "node:crypto";
import { getBoothIssues, promoteLinearIssue } from "@/lib/linear";
import {
  type PromotionCandidate,
  promoteAndReset,
  selectPromotionCandidate,
} from "@/lib/promotion";
import { getVoteStore } from "@/lib/votes";

export const dynamic = "force-dynamic";

interface PromotionReceipt {
  receiptId: string;
  issue: {
    id: string;
    identifier: string;
    createdAt: string;
    votes: number;
  };
  timing: {
    promotedAt: string;
    previousPromotionAt: string | null;
    intervalMinutes: number;
    nextEligibleAt: string;
  };
  backlogConsidered: number;
}

function buildPromotionReceipt(
  candidate: PromotionCandidate,
  promotedAt: number,
  previousPromotionAt: number | null,
  intervalMs: number,
  backlogConsidered: number,
): PromotionReceipt {
  // Fixed key order keeps the hashed JSON, and therefore the receipt ID,
  // identical for identical promotion inputs.
  const body = {
    issue: {
      id: candidate.id,
      identifier: candidate.identifier,
      createdAt: candidate.createdAt,
      votes: candidate.votes,
    },
    timing: {
      promotedAt: new Date(promotedAt).toISOString(),
      previousPromotionAt:
        previousPromotionAt === null
          ? null
          : new Date(previousPromotionAt).toISOString(),
      intervalMinutes: intervalMs / 60_000,
      nextEligibleAt: new Date(promotedAt + intervalMs).toISOString(),
    },
    backlogConsidered,
  };
  const digest = createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex")
    .slice(0, 16);
  return { receiptId: `promotion-${digest}`, ...body };
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "Promotion is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const store = getVoteStore();
  const now = Date.now();
  const interval =
    Math.max(1, Number(process.env.PROMOTION_INTERVAL_MINUTES) || 10) * 60_000;
  const lastRun = await store.getLastPromotion();
  if (lastRun && now - lastRun < interval) {
    return Response.json({ promoted: false, reason: "interval-not-reached" });
  }

  try {
    const backlog = (await getBoothIssues()).filter(
      (issue) => issue.state === "Backlog",
    );
    const candidate = selectPromotionCandidate(
      await Promise.all(
        backlog.map(async (issue) => ({
          id: issue.id,
          identifier: issue.identifier,
          createdAt: issue.createdAt,
          votes: await store.count(issue.id),
        })),
      ),
    );
    if (!candidate) {
      await store.setLastPromotion(now);
      return Response.json({ promoted: false, reason: "no-votes" });
    }
    await promoteAndReset(candidate, promoteLinearIssue, (id) => store.clear(id));
    await store.setLastPromotion(now);
    const promotedIssue = backlog.find((issue) => issue.id === candidate.id);
    if (promotedIssue) {
      await store.recordEvent({
        id: crypto.randomUUID(),
        type: "promotion",
        ticketId: promotedIssue.identifier,
        ticketTitle: promotedIssue.title,
        timestamp: new Date(now).toISOString(),
      });
    }
    const receipt = buildPromotionReceipt(
      candidate,
      now,
      lastRun,
      interval,
      backlog.length,
    );
    console.info(JSON.stringify({ event: "booth.promotion.receipt", receipt }));
    return Response.json({
      promoted: true,
      issue: candidate.identifier,
      votes: candidate.votes,
      receipt,
    });
  } catch {
    return Response.json({ error: "Promotion failed" }, { status: 502 });
  }
}
