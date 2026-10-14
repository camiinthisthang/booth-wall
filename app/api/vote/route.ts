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
    const issue = (await getBoothIssues()).find(
      (candidate) =>
        candidate.id === input.issueId && candidate.state === "Backlog",
    );
    if (!issue) {
      return Response.json({ error: "Issue is not open for voting" }, { status: 404 });
    }
    const store = getVoteStore();
    const timestamp = new Date().toISOString();
    const { accepted, count } = await store.addVoteEvent(
      input.issueId,
      input.voterId,
      {
        id: crypto.randomUUID(),
        type: "vote",
        name: input.screenName,
        ticketId: issue.identifier,
        ticketTitle: issue.title,
        timestamp,
      },
    );
    return Response.json({
      accepted,
      count,
      message: accepted ? "Vote counted" : "You already voted for this issue",
    });
  } catch {
    return Response.json({ error: "Vote could not be saved" }, { status: 502 });
  }
}
