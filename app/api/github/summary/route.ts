import { getGitHubSummary } from "@/lib/github";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getGitHubSummary());
  } catch {
    return Response.json(
      {
        configured: true,
        mergedToday: 0,
        latest: null,
        ticketPullRequests: [],
        message: "GitHub summary is temporarily unavailable",
      },
      { status: 502 },
    );
  }
}
