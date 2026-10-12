export interface CheckObservation {
  name: string;
  conclusion: string | null;
  completedAt: string | null;
}

export interface PullCheckHistory {
  number: number;
  title: string;
  mergedAt: string;
  checks: CheckObservation[];
}

export interface CaughtProblem {
  pullNumber: number;
  pullTitle: string;
  checkName: string;
  failedAt: string;
  fixedAt: string;
}

export interface MergeEvent {
  number: number;
  title: string;
  mergedAt: string;
}

export interface CaughtAtGateData {
  count: number;
  requiredChecks: string[];
  problems: CaughtProblem[];
  recentMerges: MergeEvent[];
}

type RepositoryRule = {
  type: string;
  parameters?: {
    required_status_checks?: Array<{ context?: string }>;
  };
};

type GitHubPull = {
  number: number;
  title: string;
  merged_at: string | null;
};

type GitHubCommit = { sha: string };

type GitHubCheckRun = {
  name: string;
  conclusion: string | null;
  completed_at: string | null;
};

const FAILURE_CONCLUSIONS = new Set([
  "failure",
  "cancelled",
  "timed_out",
  "action_required",
  "startup_failure",
  "stale",
]);
const CACHE_MS = 60_000;
let gateCache:
  | { expiresAt: number; value: Promise<CaughtAtGateData> }
  | undefined;
const historyCache = new Map<string, Promise<PullCheckHistory>>();

export function requiredCheckContexts(rules: RepositoryRule[]): string[] {
  return [
    ...new Set(
      rules
        .filter((rule) => rule.type === "required_status_checks")
        .flatMap(
          (rule) => rule.parameters?.required_status_checks ?? [],
        )
        .map((check) => check.context?.trim())
        .filter((context): context is string => Boolean(context)),
    ),
  ].sort();
}

export function findCaughtProblems(
  pulls: PullCheckHistory[],
  requiredChecks: string[],
): CaughtProblem[] {
  const required = new Set(requiredChecks);
  return pulls
    .flatMap((pull) =>
      [...new Set(pull.checks.map((check) => check.name))]
        .filter((name) => required.has(name))
        .flatMap((name) => {
          const observations = pull.checks
            .filter(
              (check) =>
                check.name === name &&
                check.completedAt !== null &&
                new Date(check.completedAt).getTime() <=
                  new Date(pull.mergedAt).getTime(),
            )
            .sort(
              (a, b) =>
                new Date(a.completedAt!).getTime() -
                new Date(b.completedAt!).getTime(),
            );
          const failedIndex = observations.findIndex((check) =>
            FAILURE_CONCLUSIONS.has(check.conclusion ?? ""),
          );
          if (failedIndex < 0) return [];
          const fixed = observations
            .slice(failedIndex + 1)
            .find((check) => check.conclusion === "success");
          if (!fixed) return [];
          return [
            {
              pullNumber: pull.number,
              pullTitle: pull.title,
              checkName: name,
              failedAt: observations[failedIndex].completedAt!,
              fixedAt: fixed.completedAt!,
            },
          ];
        }),
    )
    .sort(
      (a, b) =>
        new Date(b.fixedAt).getTime() - new Date(a.fixedAt).getTime() ||
        b.pullNumber - a.pullNumber ||
        a.checkName.localeCompare(b.checkName),
    );
}

export function unseenMergeEvents(
  seenKeys: Iterable<string>,
  merges: MergeEvent[],
): MergeEvent[] {
  const seen = new Set(seenKeys);
  return merges
    .filter((merge) => !seen.has(`${merge.number}:${merge.mergedAt}`))
    .sort(
      (a, b) =>
        new Date(a.mergedAt).getTime() - new Date(b.mergedAt).getTime(),
    );
}

function headers(): HeadersInit {
  const value: HeadersInit = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    value.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return value;
}

async function fetchAll<T>(
  url: string,
  requestHeaders: HeadersInit,
): Promise<T[]> {
  const values: T[] = [];
  for (let page = 1; ; page += 1) {
    const separator = url.includes("?") ? "&" : "?";
    const response = await fetch(
      `${url}${separator}per_page=100&page=${page}`,
      { headers: requestHeaders, cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(`GitHub request failed (${response.status})`);
    }
    const batch = (await response.json()) as T[];
    values.push(...batch);
    if (batch.length < 100) return values;
  }
}

async function fetchCheckRuns(
  repository: string,
  sha: string,
  requestHeaders: HeadersInit,
): Promise<GitHubCheckRun[]> {
  const checks: GitHubCheckRun[] = [];
  for (let page = 1; ; page += 1) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/commits/${sha}/check-runs?filter=all&per_page=100&page=${page}`,
      { headers: requestHeaders, cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(
        `GitHub check runs request failed (${response.status})`,
      );
    }
    const payload = (await response.json()) as {
      check_runs?: GitHubCheckRun[];
    };
    const batch = payload.check_runs ?? [];
    checks.push(...batch);
    if (batch.length < 100) return checks;
  }
}

async function loadCaughtAtGate(): Promise<CaughtAtGateData> {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
    throw new Error("GitHub is not configured");
  }
  const requestHeaders = headers();
  const [rulesResponse, pulls] = await Promise.all([
    fetch(
      `https://api.github.com/repos/${repository}/rules/branches/main`,
      { headers: requestHeaders, cache: "no-store" },
    ),
    fetchAll<GitHubPull>(
      `https://api.github.com/repos/${repository}/pulls?state=closed&sort=updated&direction=desc`,
      requestHeaders,
    ),
  ]);
  if (!rulesResponse.ok) {
    throw new Error(
      `GitHub repository rules request failed (${rulesResponse.status})`,
    );
  }
  const requiredChecks = requiredCheckContexts(
    (await rulesResponse.json()) as RepositoryRule[],
  );
  const merged = pulls.filter(
    (pull): pull is GitHubPull & { merged_at: string } =>
      pull.merged_at !== null,
  );
  const histories = await Promise.all(
    merged.map((pull): Promise<PullCheckHistory> => {
      const key = `${pull.number}:${pull.merged_at}`;
      const cached = historyCache.get(key);
      if (cached) return cached;
      const history = (async () => {
        const commits = await fetchAll<GitHubCommit>(
          `https://api.github.com/repos/${repository}/pulls/${pull.number}/commits`,
          requestHeaders,
        );
        const checkBatches = await Promise.all(
          commits.map((commit) =>
            fetchCheckRuns(repository, commit.sha, requestHeaders),
          ),
        );
        return {
          number: pull.number,
          title: pull.title,
          mergedAt: pull.merged_at,
          checks: checkBatches.flat().map((check) => ({
            name: check.name,
            conclusion: check.conclusion,
            completedAt: check.completed_at,
          })),
        };
      })();
      historyCache.set(key, history);
      void history.catch(() => historyCache.delete(key));
      return history;
    }),
  );
  const problems = findCaughtProblems(histories, requiredChecks);
  return {
    count: problems.length,
    requiredChecks,
    problems,
    recentMerges: merged
      .map((pull) => ({
        number: pull.number,
        title: pull.title,
        mergedAt: pull.merged_at,
      }))
      .sort(
        (a, b) =>
          new Date(b.mergedAt).getTime() - new Date(a.mergedAt).getTime(),
      ),
  };
}

export async function getCaughtAtGate(): Promise<CaughtAtGateData> {
  if (gateCache && gateCache.expiresAt > Date.now()) {
    return gateCache.value;
  }
  const value = loadCaughtAtGate();
  gateCache = { expiresAt: Date.now() + CACHE_MS, value };
  try {
    return await value;
  } catch (error) {
    gateCache = undefined;
    throw error;
  }
}
