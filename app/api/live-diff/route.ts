import { getLiveDiff } from "@/lib/live-diff";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.GITHUB_REPOSITORY) {
    return Response.json({
      configured: false,
      message: "Connect GitHub to stream the latest diff",
    });
  }
  try {
    return Response.json({ configured: true, ...(await getLiveDiff()) });
  } catch {
    return Response.json(
      { configured: false, message: "The latest diff is temporarily unavailable" },
      { status: 502 },
    );
  }
}
