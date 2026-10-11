import { getBoothIssues } from "@/lib/linear";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.LINEAR_API_KEY || !process.env.LINEAR_TEAM_ID) {
    return Response.json({
      configured: false,
      issues: [],
      message: "Connect Linear to load the live build board",
      fetchedAt: new Date(0).toISOString(),
    });
  }
  try {
    return Response.json({
      configured: true,
      issues: await getBoothIssues(),
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return Response.json(
      { error: "The build board could not reach Linear" },
      { status: 502 },
    );
  }
}
