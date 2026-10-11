import { getBoothIssues } from "@/lib/linear";
import { getVoteStore } from "@/lib/votes";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.LINEAR_API_KEY || !process.env.LINEAR_TEAM_ID) {
    return Response.json({
      configured: false,
      issues: [],
      message: "Voting opens when the Booth Linear team is connected",
    });
  }
  try {
    const store = getVoteStore();
    const backlog = (await getBoothIssues()).filter(
      (issue) => issue.state === "Backlog",
    );
    const issues = await Promise.all(
      backlog.map(async (issue) => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        createdAt: issue.createdAt,
        votes: await store.count(issue.id),
      })),
    );
    issues.sort(
      (a, b) =>
        b.votes - a.votes ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
        a.id.localeCompare(b.id),
    );
    return Response.json({ configured: true, issues });
  } catch {
    return Response.json(
      { error: "Voting could not reach the Booth backlog" },
      { status: 502 },
    );
  }
}
