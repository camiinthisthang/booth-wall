export const BOARD_LANES = [
  "Backlog",
  "Todo",
  "In Progress",
  "In Review",
  "Done",
] as const;

export type BoardLane = (typeof BOARD_LANES)[number];

export interface BoothIssue {
  id: string;
  identifier: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  state: BoardLane;
  stateId: string;
  labels: string[];
  assignee: string | null;
}

type LinearIssueNode = {
  id: string;
  identifier: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  state: { id: string; name: string; type?: string };
  labels?: { nodes?: Array<{ name: string }> };
  assignee?: { name?: string } | null;
};

const LINEAR_ENDPOINT = "https://api.linear.app/graphql";

// Canceled tickets are hidden from the wall entirely rather than given a lane,
// so callers must drop them before normalizing.
export function isCanceledLinearState(name: string, type = ""): boolean {
  return type.toLowerCase() === "canceled" || /cancel/i.test(name);
}

export function normalizeLinearState(name: string, type = ""): BoardLane {
  const value = `${name} ${type}`.toLowerCase();
  if (value.includes("review")) return "In Review";
  if (
    value.includes("todo") ||
    value.includes("ready") ||
    value.includes("unstarted")
  ) {
    return "Todo";
  }
  if (
    value.includes("progress") ||
    value.includes("started") ||
    value.includes("develop")
  ) {
    return "In Progress";
  }
  if (value.includes("done") || value.includes("complete")) {
    return "Done";
  }
  return "Backlog";
}

export async function linearGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) throw new Error("Linear is not configured");

  const response = await fetch(LINEAR_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (!response.ok || payload.errors?.length || !payload.data) {
    throw new Error(payload.errors?.[0]?.message ?? "Linear request failed");
  }
  return payload.data;
}

export async function getBoothIssues(): Promise<BoothIssue[]> {
  const teamId = process.env.LINEAR_TEAM_ID;
  if (!teamId) throw new Error("Linear is not configured");

  const data = await linearGraphQL<{
    team: { issues: { nodes: LinearIssueNode[] } } | null;
  }>(
    `query BoothIssues($teamId: String!) {
      team(id: $teamId) {
        issues(first: 100, orderBy: createdAt) {
          nodes {
            id identifier title createdAt updatedAt
            state { id name type }
            labels { nodes { name } }
            assignee { name }
          }
        }
      }
    }`,
    { teamId },
  );
  if (!data.team) throw new Error("Configured Linear team was not found");

  return data.team.issues.nodes
    .filter(
      (issue) => !isCanceledLinearState(issue.state.name, issue.state.type),
    )
    .map((issue) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      state: normalizeLinearState(issue.state.name, issue.state.type),
      stateId: issue.state.id,
      labels: issue.labels?.nodes?.map((label) => label.name) ?? [],
      assignee: issue.assignee?.name ?? null,
    }));
}

export function agentDisplay(issue: BoothIssue): string | null {
  const agentLabel = issue.labels.find((label) =>
    /^(agent|droid)(:|$)/i.test(label),
  );
  if (agentLabel) {
    const labelName = agentLabel.split(":")[1]?.trim();
    return labelName || "Factory Droid";
  }
  return issue.assignee;
}

export async function promoteLinearIssue(issueId: string): Promise<void> {
  const teamId = process.env.LINEAR_TEAM_ID;
  if (!teamId) throw new Error("Linear is not configured");
  const data = await linearGraphQL<{
    team: {
      states: { nodes: Array<{ id: string; name: string; type: string }> };
    } | null;
  }>(
    `query TeamStates($teamId: String!) {
      team(id: $teamId) { states { nodes { id name type } } }
    }`,
    { teamId },
  );
  const todo = data.team?.states.nodes.find(
    (state) => normalizeLinearState(state.name, state.type) === "Todo",
  );
  if (!todo) throw new Error("The Linear team has no Todo workflow state");

  await linearGraphQL(
    `mutation PromoteIssue($issueId: String!, $stateId: String!) {
      issueUpdate(id: $issueId, input: { stateId: $stateId }) {
        success
      }
    }`,
    { issueId, stateId: todo.id },
  );
}
