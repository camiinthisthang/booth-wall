import { getScanStore, redisConfigured } from "@/lib/scans";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = Date.now();
    return Response.json(
      {
        configured: redisConfigured(),
        totalToday: await getScanStore().getScanTotal(now),
        serverTime: new Date(now).toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Scan total is temporarily unavailable" },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
