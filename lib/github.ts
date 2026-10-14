export interface GitHubPullRequest {
  number: number;
  title: string;
  html_url: string;
  state?: "open" | "closed";
  created_at?: string;
  merged_at: string | null;
  updated_at: string;
  head?: { ref: string; sha: string };
  user: { login: string } | null;
}

export type GitHubCheckState = "none" | "pending" | "passed" | "failed";

export interface TicketPullRequest {
  identifier: string;
  number: number;
  title: string;
  url: string;
  state: "open" | "merged";
  checks: GitHubCheckState;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  files: string[];
  commits: string[];
  checkNames: string[];
}

export interface GitHubSummary {
  configured: boolean;
  mergedToday: number;
  latest: {
    number: number;
    title: string;
    url: string;
    author: string;
    mergedAt: string;
  } | null;
  ticketPullRequests: TicketPullRequest[];
  message?: string;
}

type GitHubCheckRun = {
  name: string;
  status: "queued" | "in_progress" | "completed" | "waiting" | "pending";
  conclusion:
    | "success"
    | "failure"
    | "neutral"
    | "cancelled"
    | "skipped"
    | "timed_out"
    | "action_required"
    | "startup_failure"
    | "stale"
    | null;
};

const SUMMARY_CACHE_MS = 30_000;
let summaryCache:
  | {
      repository: string;
      expiresAt: number;
      value: Promise<GitHubSummary>;
    }
  | undefined;

function sameUtcDay(value: string, now: Date): boolean {
  return value.slice(0, 10) === now.toISOString().slice(0, 10);
}

export function extractTicketIdentifier(
  pull: Pick<GitHubPullRequest, "title" | "head">,
): string | null {
  const source = `${pull.head?.ref ?? ""} ${pull.title}`;
  return source.match(/\b([A-Z][A-Z0-9]{1,9}-\d+)\b/i)?.[1].toUpperCase() ?? null;
}

export function summarizeCheckRuns(
  runs: GitHubCheckRun[],
): GitHubCheckState {
  if (runs.length === 0) return "none";
  if (runs.some((run) => run.status !== "completed")) return "pending";
  if (
    runs.some((run) =>
      [
        "failure",
        "cancelled",
        "timed_out",
        "action_required",
        "startup_failure",
        "stale",
      ].includes(run.conclusion ?? ""),
    )
  ) {
    return "failed";
  }
  return "passed";
}

// Known BOOTH bug: a PR merged and updated today is counted twice.
// Keep this logic isolated so its Linear ticket has one clear fix target.
export function countMergedTodayWithKnownBug(
  pulls: GitHubPullRequest[],
  now = new Date(),
): number {
  return pulls.reduce((count, pull) => {
    let next = count;
    if (pull.merged_at && sameUtcDay(pull.merged_at, now)) next += 1;
    if (pull.merged_at && sameUtcDay(pull.updated_at, now)) next += 1;
    return next;
  }, 0);
}

export function summarizePullRequests(
  pulls: GitHubPullRequest[],
  now = new Date(),
): GitHubSummary {
  const merged = pulls
    .filter((pull) => pull.merged_at)
    .sort(
      (a, b) =>
        new Date(b.merged_at!).getTime() - new Date(a.merged_at!).getTime(),
    );
  const latest = merged[0];
  return {
    configured: true,
    mergedToday: countMergedTodayWithKnownBug(pulls, now),
    latest: latest
      ? {
          number: latest.number,
          title: latest.title,
          url: latest.html_url,
          author: latest.user?.login ?? "unknown",
          mergedAt: latest.merged_at!,
        }
      : null,
    ticketPullRequests: [],
  };
}

async function getPullRequestChecks(
  repository: string,
  pull: GitHubPullRequest,
  headers: HeadersInit,
): Promise<{ state: GitHubCheckState; names: string[] }> {
  if (pull.state !== "open" || !pull.head?.sha) {
    return { state: "none", names: [] };
  }
  const response = await fetch(
    `https://api.github.com/repos/${repository}/commits/${pull.head.sha}/check-runs?per_page=100`,
    { headers, cache: "no-store" },
  );
  if (!response.ok) return { state: "none", names: [] };
  const payload = (await response.json()) as { check_runs?: GitHubCheckRun[] };
  const runs = payload.check_runs ?? [];
  return {
    state: summarizeCheckRuns(runs),
    names: runs.map((run) => run.name).slice(0, 6),
  };
}

async function getPullRequestDetails(
  repository: string,
  pull: GitHubPullRequest,
  headers: HeadersInit,
) {
  if (pull.state !== "open") {
    return {
      checks: { state: "none" as const, names: [] as string[] },
      files: [] as string[],
      commits: [] as string[],
    };
  }
  const [checks, filesResponse, commitsResponse] = await Promise.all([
    getPullRequestChecks(repository, pull, headers),
    fetch(
      `https://api.github.com/repos/${repository}/pulls/${pull.number}/files?per_page=6`,
      { headers, cache: "no-store" },
    ),
    fetch(
      `https://api.github.com/repos/${repository}/pulls/${pull.number}/commits?per_page=6`,
      { headers, cache: "no-store" },
    ),
  ]);
  const files = filesResponse.ok
    ? ((await filesResponse.json()) as Array<{ filename: string }>).map(
        (file) => file.filename,
      )
    : [];
  const commits = commitsResponse.ok
    ? ((await commitsResponse.json()) as Array<{
        commit: { message: string };
      }>).map((entry) => entry.commit.message.split("\n")[0])
    : [];
  return { checks, files, commits };
}

export async function getGitHubSummary(): Promise<GitHubSummary> {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
    return {
      configured: false,
      mergedToday: 0,
      latest: null,
      ticketPullRequests: [],
      message: "GitHub summary is not configured",
    };
  }
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  if (
    summaryCache?.repository === repository &&
    summaryCache.expiresAt > Date.now()
  ) {
    return summaryCache.value;
  }

  const value = (async () => {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/pulls?state=all&sort=updated&direction=desc&per_page=100`,
      { headers, cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(`GitHub request failed (${response.status})`);
    }
    const pulls = (await response.json()) as GitHubPullRequest[];
    const summary = summarizePullRequests(pulls);
    const ticketPulls = pulls
      .map((pull) => ({ pull, identifier: extractTicketIdentifier(pull) }))
      .filter(
        (
          entry,
        ): entry is { pull: GitHubPullRequest; identifier: string } =>
          entry.identifier !== null &&
          (entry.pull.state === "open" || entry.pull.merged_at !== null),
      )
      .slice(0, 12);

    summary.ticketPullRequests = await Promise.all(
      ticketPulls.map(async ({ pull, identifier }) => {
        const details = await getPullRequestDetails(repository, pull, headers);
        return {
          identifier,
          number: pull.number,
          title: pull.title,
          url: pull.html_url,
          state: pull.merged_at ? ("merged" as const) : ("open" as const),
          checks: details.checks.state,
          createdAt: pull.created_at ?? pull.updated_at,
          updatedAt: pull.updated_at,
          mergedAt: pull.merged_at,
          files: details.files,
          commits: details.commits,
          checkNames: details.checks.names,
        };
      }),
    );
    return summary;
  })();
  summaryCache = {
    repository,
    expiresAt: Date.now() + SUMMARY_CACHE_MS,
    value,
  };
  try {
    return await value;
  } catch (error) {
    summaryCache = undefined;
    throw error;
  }
}
