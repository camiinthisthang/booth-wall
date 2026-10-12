import { getTicketToLiveMetrics } from "@/lib/ticket-to-live";

export const dynamic = "force-dynamic";

export async function GET() {
  if (
    !process.env.LINEAR_API_KEY ||
    !process.env.LINEAR_TEAM_ID ||
    !process.env.GITHUB_REPOSITORY
  ) {
    return Response.json({
      configured: false,
      message: "Connect Linear and GitHub to start the build clock",
    });
  }
  try {
    return Response.json({
      configured: true,
      ...(await getTicketToLiveMetrics()),
    });
  } catch {
    return Response.json(
      { configured: false, message: "Build timing is temporarily unavailable" },
      { status: 502 },
    );
  }
}
