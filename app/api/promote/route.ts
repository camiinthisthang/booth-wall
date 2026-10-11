import { getBoothIssues, promoteLinearIssue } from "@/lib/linear";
import {
  promoteAndReset,
  selectPromotionCandidate,
} from "@/lib/promotion";
import { getVoteStore } from "@/lib/votes";

export const dynamic = "force-dynamic";

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
    return Response.json({
      promoted: true,
      issue: candidate.identifier,
      votes: candidate.votes,
    });
  } catch {
    return Response.json({ error: "Promotion failed" }, { status: 502 });
  }
}
