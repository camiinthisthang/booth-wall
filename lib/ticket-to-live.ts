import {
  linearGraphQL,
  normalizeLinearState,
  type BoardLane,
} from "@/lib/linear";

export interface TicketTimeline {
  identifier: string;
  title: string;
  state: BoardLane;
  startedAt: string | null;
}

export interface ProductionDeployment {
  identifier: string;
  deployedAt: string;
}

export interface TicketToLiveMetrics {
  current: {
    identifier: string;
    title: string;
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
  } | null;
  fastestMs: number | null;
  medianMs: number | null;
}

type LinearHistoryNode = {
  createdAt: string;
  toState: { name: string; type: string } | null;
};

type GitHubPull = {
  number: number;
  title: string;
  merged_at: string | null;
  merge_commit_sha: string | null;
  head: { ref: string };
};

type GitHubDeployment = {
  statuses_url: string;
  sha: string;
};

type GitHubDeploymentStatus = {
  state: string;
  created_at: string;
};

const CACHE_MS = 30_000;
let metricsCache:
  | { expiresAt: number; value: Promise<TicketToLiveMetrics> }
  | undefined;

function sameUtcDay(value: string, now: Date): boolean {
  return value.slice(0, 10) === now.toISOString().slice(0, 10);
}

export function startedAtFromHistory(
  history: LinearHistoryNode[],
): string | null {
  const entries = history
    .filter(
      (entry) =>
        entry.toState &&
        normalizeLinearState(entry.toState.name, entry.toState.type) ===
          "In Progress",
    )
    .map((entry) => entry.createdAt)
    .sort();
  return entries[0] ?? null;
}

export function median(milliseconds: number[]): number | null {
  if (milliseconds.length === 0) return null;
  const sorted = [...milliseconds].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildTicketToLiveMetrics(
  timelines: TicketTimeline[],
  deployments: ProductionDeployment[],
  now = new Date(),
): TicketToLiveMetrics {
  const deploymentByTicket = new Map<string, ProductionDeployment>();
  for (const deployment of deployments) {
    const current = deploymentByTicket.get(deployment.identifier);
    if (
      !current ||
      new Date(deployment.deployedAt).getTime() >
        new Date(current.deployedAt).getTime()
    ) {
      deploymentByTicket.set(deployment.identifier, deployment);
    }
  }

  const completed = timelines.flatMap((ticket) => {
    if (!ticket.startedAt) return [];
    const deployment = deploymentByTicket.get(ticket.identifier);
    if (!deployment) return [];
    const duration =
      new Date(deployment.deployedAt).getTime() -
      new Date(ticket.startedAt).getTime();
    return duration >= 0
      ? [{ ticket, deployedAt: deployment.deployedAt, duration }]
      : [];
  });
  const today = completed.filter((entry) =>
    sameUtcDay(entry.deployedAt, now),
  );
  const durations = today.map((entry) => entry.duration);

  const running = timelines
    .filter(
      (ticket) =>
        ticket.startedAt &&
        (ticket.state === "In Progress" || ticket.state === "In Review") &&
        !deploymentByTicket.has(ticket.identifier),
    )
    .sort(
      (a, b) =>
        new Date(a.startedAt!).getTime() -
          new Date(b.startedAt!).getTime() ||
        a.identifier.localeCompare(b.identifier, undefined, { numeric: true }),
    )[0];
  const latestCompleted = today.sort(
    (a, b) =>
      new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime(),
  )[0];

  const current = running
    ? {
        identifier: running.identifier,
        title: running.title,
        startedAt: running.startedAt!,
        completedAt: null,
        durationMs: null,
      }
    : latestCompleted
      ? {
          identifier: latestCompleted.ticket.identifier,
          title: latestCompleted.ticket.title,
          startedAt: latestCompleted.ticket.startedAt!,
          completedAt: latestCompleted.deployedAt,
          durationMs: latestCompleted.duration,
        }
      : null;

  return {
    current,
    fastestMs: durations.length > 0 ? Math.min(...durations) : null,
    medianMs: median(durations),
  };
}

function githubHeaders(): HeadersInit {
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function getTimelines(): Promise<TicketTimeline[]> {
  const teamId = process.env.LINEAR_TEAM_ID;
  if (!teamId) throw new Error("Linear is not configured");
  const data = await linearGraphQL<{
    team: {
      issues: {
        nodes: Array<{
          id: string;
          identifier: string;
          title: string;
          state: { name: string; type: string };
        }>;
      };
    } | null;
  }>(
    `query TicketTimelines($teamId: String!) {
      team(id: $teamId) {
        issues(first: 100, orderBy: updatedAt) {
          nodes {
            id identifier title
            state { name type }
          }
        }
      }
    }`,
    { teamId },
  );
  if (!data.team) throw new Error("Configured Linear team was not found");
  return Promise.all(
    data.team.issues.nodes.map(async (issue) => {
      const historyData = await linearGraphQL<{
        issue: { history: { nodes: LinearHistoryNode[] } } | null;
      }>(
        `query TicketHistory($issueId: String!) {
          issue(id: $issueId) {
            history(first: 100) {
              nodes { createdAt toState { name type } }
            }
          }
        }`,
        { issueId: issue.id },
      );
      return {
        identifier: issue.identifier,
        title: issue.title,
        state: normalizeLinearState(issue.state.name, issue.state.type),
        startedAt: startedAtFromHistory(
          historyData.issue?.history.nodes ?? [],
        ),
      };
    }),
  );
}

function ticketIdentifier(pull: GitHubPull): string | null {
  return `${pull.head.ref} ${pull.title}`
    .match(/\b([A-Z][A-Z0-9]{1,9}-\d+)\b/i)?.[1]
    .toUpperCase() ?? null;
}

async function getDeployments(): Promise<ProductionDeployment[]> {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
    throw new Error("GitHub is not configured");
  }
  const headers = githubHeaders();
  const pullResponse = await fetch(
    `https://api.github.com/repos/${repository}/pulls?state=closed&sort=updated&direction=desc&per_page=100`,
    { headers, cache: "no-store" },
  );
  if (!pullResponse.ok) {
    throw new Error(`GitHub request failed (${pullResponse.status})`);
  }
  const pulls = (await pullResponse.json()) as GitHubPull[];
  const ticketBySha = new Map(
    pulls.flatMap((pull) => {
      const identifier = ticketIdentifier(pull);
      return identifier && pull.merge_commit_sha
        ? [[pull.merge_commit_sha, identifier] as const]
        : [];
    }),
  );
  const deploymentResponse = await fetch(
    `https://api.github.com/repos/${repository}/deployments?environment=Production&per_page=100`,
    { headers, cache: "no-store" },
  );
  if (!deploymentResponse.ok) {
    throw new Error(
      `GitHub deployment request failed (${deploymentResponse.status})`,
    );
  }
  const deployments =
    (await deploymentResponse.json()) as GitHubDeployment[];
  const results = await Promise.all(
    deployments.map(async (deployment) => {
      const identifier = ticketBySha.get(deployment.sha);
      if (!identifier) return null;
      const statusResponse = await fetch(
        `${deployment.statuses_url}?per_page=100`,
        { headers, cache: "no-store" },
      );
      if (!statusResponse.ok) return null;
      const statuses =
        (await statusResponse.json()) as GitHubDeploymentStatus[];
      const deployedAt =
        statuses
          .filter((status) => status.state === "success")
          .map((status) => status.created_at)
          .sort()[0] ?? null;
      return deployedAt ? { identifier, deployedAt } : null;
    }),
  );
  return results.filter(
    (deployment): deployment is ProductionDeployment => deployment !== null,
  );
}

export async function getTicketToLiveMetrics(): Promise<TicketToLiveMetrics> {
  if (metricsCache && metricsCache.expiresAt > Date.now()) {
    return metricsCache.value;
  }
  const value = (async () => {
    const timelines = await getTimelines();
    const deployments = await getDeployments();
    return buildTicketToLiveMetrics(timelines, deployments);
  })();
  metricsCache = { expiresAt: Date.now() + CACHE_MS, value };
  try {
    return await value;
  } catch (error) {
    metricsCache = undefined;
    throw error;
  }
}
