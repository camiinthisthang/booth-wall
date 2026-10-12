import { getCaughtAtGate } from "@/lib/caught-at-gate";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.GITHUB_REPOSITORY) {
    return Response.json({
      configured: false,
      message: "Connect GitHub to inspect required checks",
    });
  }
  try {
    return Response.json({
      configured: true,
      ...(await getCaughtAtGate()),
    });
  } catch {
    return Response.json(
      { configured: false, message: "Required check history is unavailable" },
      { status: 502 },
    );
  }
}
