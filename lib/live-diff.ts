export interface LiveDiffLine {
  kind: "addition" | "deletion" | "header" | "context" | "notice";
  text: string;
}

export interface LiveDiffData {
  pull: {
    number: number;
    ticketId: string | null;
    filesChanged: number;
    lines: LiveDiffLine[];
  } | null;
}

interface GitHubPull {
  number: number;
  title: string;
  created_at: string;
  changed_files: number;
  head: { ref: string };
}

interface GitHubFile {
  filename: string;
  status: string;
  patch?: string;
}

const CACHE_MS = 15_000;
let diffCache: { expiresAt: number; value: Promise<LiveDiffData> } | undefined;

export function ticketIdForPull(
  pull: Pick<GitHubPull, "title" | "head">,
): string | null {
  return `${pull.head.ref} ${pull.title}`
    .match(/\b([A-Z][A-Z0-9]{1,9}-\d+)\b/i)?.[1]
    .toUpperCase() ?? null;
}

export function mostRecentPull(pulls: GitHubPull[]): GitHubPull | null {
  return (
    [...pulls].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime() ||
        b.number - a.number,
    )[0] ?? null
  );
}

export function diffLines(files: GitHubFile[]): LiveDiffLine[] {
  return files.flatMap((file) => {
    const heading: LiveDiffLine = {
      kind: "header",
      text: `${file.status.toUpperCase()} ${file.filename}`,
    };
    if (!file.patch) {
      return [
        heading,
        {
          kind: "notice",
          text: "  Binary or large diff available on GitHub",
        },
      ];
    }
    return [
      heading,
      ...file.patch.split("\n").map((text): LiveDiffLine => {
        if (text.startsWith("@@")) return { kind: "header", text };
        if (text.startsWith("+")) return { kind: "addition", text };
        if (text.startsWith("-")) return { kind: "deletion", text };
        return { kind: "context", text };
      }),
    ];
  });
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

async function loadLiveDiff(): Promise<LiveDiffData> {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
    throw new Error("GitHub is not configured");
  }
  const requestHeaders = headers();
  const pullsResponse = await fetch(
    `https://api.github.com/repos/${repository}/pulls?state=all&sort=created&direction=desc&per_page=20`,
    { headers: requestHeaders, cache: "no-store" },
  );
  if (!pullsResponse.ok) {
    throw new Error(`GitHub request failed (${pullsResponse.status})`);
  }
  const pull = mostRecentPull((await pullsResponse.json()) as GitHubPull[]);
  if (!pull) return { pull: null };

  const detailResponse = await fetch(
    `https://api.github.com/repos/${repository}/pulls/${pull.number}`,
    { headers: requestHeaders, cache: "no-store" },
  );
  if (!detailResponse.ok) {
    throw new Error(`GitHub pull request failed (${detailResponse.status})`);
  }
  const detail = (await detailResponse.json()) as GitHubPull;
  const filePages = await Promise.all(
    Array.from(
      { length: Math.max(1, Math.ceil(detail.changed_files / 100)) },
      async (_, index) => {
        const filesResponse = await fetch(
          `https://api.github.com/repos/${repository}/pulls/${pull.number}/files?per_page=100&page=${index + 1}`,
          { headers: requestHeaders, cache: "no-store" },
        );
        if (!filesResponse.ok) {
          throw new Error(
            `GitHub files request failed (${filesResponse.status})`,
          );
        }
        return (await filesResponse.json()) as GitHubFile[];
      },
    ),
  );
  const files = filePages.flat();
  return {
    pull: {
      number: detail.number,
      ticketId: ticketIdForPull(detail),
      filesChanged: detail.changed_files,
      lines: diffLines(files),
    },
  };
}

export async function getLiveDiff(): Promise<LiveDiffData> {
  if (diffCache && diffCache.expiresAt > Date.now()) {
    return diffCache.value;
  }
  const value = loadLiveDiff();
  diffCache = { expiresAt: Date.now() + CACHE_MS, value };
  try {
    return await value;
  } catch (error) {
    diffCache = undefined;
    throw error;
  }
}
