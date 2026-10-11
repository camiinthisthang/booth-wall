import { pathToFileURL } from "node:url";

type SeedTicket = {
  marker: string;
  title: string;
  path: string;
  notes: string;
  acceptance: string;
};

export const seedTickets: SeedTicket[] = [
  { marker: "animated-wordmark", title: "Animate the Factory wordmark", path: "features/AnimatedWordmark.tsx", notes: "Replace the wireframe with a restrained LED scan animation.", acceptance: "The mark animates smoothly and respects reduced motion." },
  { marker: "visitor-clock", title: "Show the visitor time zone clock", path: "features/VisitorClock.tsx", notes: "Render local visitor time with a compact zone label.", acceptance: "The clock updates without hydration warnings." },
  { marker: "droid-facts", title: "Rotate live Droid facts", path: "features/DroidFacts.tsx", notes: "Cycle through short facts with clear pacing.", acceptance: "Facts rotate and remain readable at wall distance." },
  { marker: "merge-confetti", title: "Celebrate merges with confetti", path: "features/MergeConfetti.tsx", notes: "React to an increased merge count with industrial pixel confetti.", acceptance: "One bounded celebration plays per new merge and reduced motion is static." },
  { marker: "build-pulse", title: "Visualize the active build pulse", path: "features/BuildPulse.tsx", notes: "Create an ambient pulse for current build activity.", acceptance: "The pulse has clear idle and active states." },
  { marker: "ambient-particles", title: "Add ambient factory particles", path: "features/AmbientParticles.tsx", notes: "Add a subtle performant depth layer.", acceptance: "The effect stays smooth and never obscures type." },
  { marker: "ticket-spotlight", title: "Spotlight the current ticket", path: "features/TicketSpotlight.tsx", notes: "Feature one in-progress issue with its identifier and owner.", acceptance: "The spotlight handles an empty in-progress lane." },
  { marker: "shipped-ticker", title: "Build the shipped work ticker", path: "features/ShippedTicker.tsx", notes: "Scroll recently completed issue titles.", acceptance: "The ticker loops cleanly and pauses with reduced motion." },
  { marker: "booth-status", title: "Display booth system status", path: "features/BoothStatus.tsx", notes: "Summarize integration health without exposing credentials.", acceptance: "Linear, GitHub, and voting each show a safe status." },
  { marker: "reaction-meter", title: "Add a visitor reaction meter", path: "features/ReactionMeter.tsx", notes: "Turn lightweight reactions into an expressive gauge.", acceptance: "The gauge is keyboard accessible and rate limited." },
  { marker: "sound-visualizer", title: "Render a sound visualizer", path: "features/SoundVisualizer.tsx", notes: "Create an audio-reactive visual with a no-permission fallback.", acceptance: "The component works without microphone permission." },
  { marker: "pixel-mascot", title: "Introduce the pixel Droid mascot", path: "features/PixelMascot.tsx", notes: "Create a low-resolution Droid character with small state changes.", acceptance: "The mascot is crisp at all wall scale factors." },
  { marker: "theme-toggle", title: "Add an alternate booth theme", path: "app/globals.css", notes: "Define a high-contrast alternate palette using CSS variables.", acceptance: "Both themes meet contrast requirements and persist." },
  { marker: "visitor-counter", title: "Count active booth visitors", path: "app/api/visitors/route.ts", notes: "Return an anonymous approximate active visitor count.", acceptance: "The endpoint expires inactive sessions and stores no personal data." },
  { marker: "pr-double-count", title: "Fix merged PR double counting", path: "lib/github.ts", notes: "Remove the known second increment when a merged PR is also updated today.", acceptance: "Enable the skipped desired-behavior test and count each merged PR once." },
  { marker: "qr-panel", title: "Add the vote QR panel", path: "features/VoteQrPanel.tsx", notes: "Render a high-contrast QR code linking to the vote surface.", acceptance: "The code scans from the intended wall distance." },
  { marker: "board-empty-copy", title: "Improve board empty states", path: "app/board/board.tsx", notes: "Give each board state concise action-oriented copy.", acceptance: "Loading, disconnected, stale, empty, and error states are distinct." },
  { marker: "vote-share", title: "Add ballot share feedback", path: "app/vote/vote.tsx", notes: "Offer a native share action with a clipboard fallback.", acceptance: "Share works on mobile and reports fallback success." },
  { marker: "board-keyboard", title: "Improve board keyboard navigation", path: "app/board/page.tsx", notes: "Add a skip path and semantic lane navigation.", acceptance: "All five lanes are reachable and announced clearly." },
  { marker: "promotion-receipt", title: "Record promotion receipts", path: "app/api/promote/route.ts", notes: "Return structured timing and winning issue metadata for operations.", acceptance: "Each successful promotion has a deterministic receipt." },
];

function descriptionFor(ticket: SeedTicket) {
  return [
    `<!-- booth-seed:${ticket.marker} -->`,
    "## Implementation notes",
    ticket.notes,
    "",
    "## Acceptance criteria",
    `- ${ticket.acceptance}`,
    "",
    "## Intended file",
    `\`${ticket.path}\``,
  ].join("\n");
}

type GraphRequest = <T>(
  query: string,
  variables: Record<string, unknown>,
) => Promise<T>;

export async function seedLinear(request: GraphRequest, teamId: string) {
  const existing = await request<{
    team: { id: string; issues: { nodes: Array<{ description: string | null }> } } | null;
  }>(
    `query ExistingBoothSeeds($teamId: String!) {
      team(id: $teamId) {
        id
        issues(first: 250) { nodes { description } }
      }
    }`,
    { teamId },
  );
  if (!existing.team) throw new Error("Configured Linear team was not found");

  const descriptions = existing.team.issues.nodes.map((issue) => issue.description ?? "");
  let created = 0;
  let skipped = 0;
  for (const ticket of seedTickets) {
    const marker = `<!-- booth-seed:${ticket.marker} -->`;
    if (descriptions.some((description) => description.includes(marker))) {
      skipped += 1;
      continue;
    }
    await request(
      `mutation CreateBoothSeed($input: IssueCreateInput!) {
        issueCreate(input: $input) { success issue { identifier } }
      }`,
      {
        input: {
          teamId: existing.team.id,
          title: ticket.title,
          description: descriptionFor(ticket),
        },
      },
    );
    created += 1;
  }
  return { created, skipped };
}

async function main() {
  const apiKey = process.env.LINEAR_API_KEY;
  const teamId = process.env.LINEAR_TEAM_ID;
  if (!apiKey || !teamId) {
    throw new Error("LINEAR_API_KEY and LINEAR_TEAM_ID are required");
  }
  const request: GraphRequest = async <T>(
    query: string,
    variables: Record<string, unknown>,
  ) => {
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const result = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };
    if (!response.ok || result.errors?.length || !result.data) {
      throw new Error(result.errors?.[0]?.message ?? "Linear request failed");
    }
    return result.data;
  };
  const result = await seedLinear(request, teamId);
  console.log(`Linear seed complete: ${result.created} created, ${result.skipped} skipped.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
