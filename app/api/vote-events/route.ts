import { getVoteStore } from "@/lib/votes";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const store = getVoteStore();
    const now = Date.now();
    const [events, totalToday] = await Promise.all([
      store.getEvents(),
      store.getVoteTotal(now),
    ]);
    return Response.json({
      configured: Boolean(
        (process.env.UPSTASH_REDIS_REST_URL ??
          process.env.KV_REST_API_URL) &&
          (process.env.UPSTASH_REDIS_REST_TOKEN ??
            process.env.KV_REST_API_TOKEN),
      ),
      events,
      totalToday,
      serverTime: new Date(now).toISOString(),
    });
  } catch {
    return Response.json(
      { error: "Live votes are temporarily unavailable" },
      { status: 502 },
    );
  }
}
