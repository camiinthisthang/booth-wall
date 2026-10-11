import { getBoothIssues } from "@/lib/linear";
import { getVoteStore, validateVoteInput } from "@/lib/votes";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A valid JSON body is required" }, { status: 400 });
  }
  const input = validateVoteInput(body);
  if (!input.ok) {
    return Response.json({ error: input.error }, { status: 400 });
  }
  if (!process.env.LINEAR_API_KEY || !process.env.LINEAR_TEAM_ID) {
    return Response.json({ error: "Voting is not configured" }, { status: 503 });
  }

  try {
    const isBacklogIssue = (await getBoothIssues()).some(
      (issue) => issue.id === input.issueId && issue.state === "Backlog",
    );
    if (!isBacklogIssue) {
      return Response.json({ error: "Issue is not open for voting" }, { status: 404 });
    }
    const store = getVoteStore();
    const accepted = await store.addVote(input.issueId, input.voterId);
    return Response.json({
      accepted,
      count: await store.count(input.issueId),
      message: accepted ? "Vote counted" : "You already voted for this issue",
    });
  } catch {
    return Response.json({ error: "Vote could not be saved" }, { status: 502 });
  }
}
