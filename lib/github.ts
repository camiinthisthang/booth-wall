export interface GitHubPullRequest {
  number: number;
  title: string;
  html_url: string;
  merged_at: string | null;
  updated_at: string;
  user: { login: string } | null;
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
  message?: string;
}

function sameUtcDay(value: string, now: Date): boolean {
  return value.slice(0, 10) === now.toISOString().slice(0, 10);
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
  };
}

export async function getGitHubSummary(): Promise<GitHubSummary> {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
    return {
      configured: false,
      mergedToday: 0,
      latest: null,
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
  const response = await fetch(
    `https://api.github.com/repos/${repository}/pulls?state=closed&sort=updated&direction=desc&per_page=100`,
    { headers, cache: "no-store" },
  );
  if (!response.ok) throw new Error(`GitHub request failed (${response.status})`);
  return summarizePullRequests((await response.json()) as GitHubPullRequest[]);
}
