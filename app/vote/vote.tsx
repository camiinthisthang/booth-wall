"use client";

import { useEffect, useState } from "react";

type VoteIssue = {
  id: string;
  identifier: string;
  title: string;
  createdAt: string;
  votes: number;
};

type IssueResponse = {
  configured: boolean;
  issues: VoteIssue[];
  message?: string;
};

type GitHubSummary = {
  mergedToday: number;
};

const VOTER_KEY = "booth-voter-id";
const VOTED_KEY = "booth-voted-issues";

function browserVoterId() {
  let id = localStorage.getItem(VOTER_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VOTER_KEY, id);
  }
  return id;
}

export function Vote() {
  const [data, setData] = useState<IssueResponse | null>(null);
  const [error, setError] = useState("");
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [mergedToday, setMergedToday] = useState(0);

  useEffect(() => {
    const savedVoteTimer = window.setTimeout(() => {
      const saved = JSON.parse(localStorage.getItem(VOTED_KEY) ?? "[]") as string[];
      setVoted(new Set(saved));
    }, 0);
    fetch("/api/issues", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setData((await response.json()) as IssueResponse);
      })
      .catch(() => setError("The ballot is temporarily unavailable."));
    fetch("/api/github/summary", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const summary = (await response.json()) as GitHubSummary;
        setMergedToday(summary.mergedToday);
      })
      .catch(() => undefined);
    return () => window.clearTimeout(savedVoteTimer);
  }, []);

  async function castVote(issueId: string) {
    if (!data || voted.has(issueId) || pending.has(issueId)) return;
    setError("");
    setPending((current) => new Set(current).add(issueId));
    setVoted((current) => {
      const next = new Set(current).add(issueId);
      localStorage.setItem(VOTED_KEY, JSON.stringify([...next]));
      return next;
    });
    setData({
      ...data,
      issues: data.issues.map((issue) =>
        issue.id === issueId ? { ...issue, votes: issue.votes + 1 } : issue,
      ),
    });

    try {
      const response = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId, voterId: browserVoterId() }),
      });
      const result = (await response.json()) as { count?: number; error?: string };
      if (!response.ok || typeof result.count !== "number") {
        throw new Error(result.error ?? "Vote failed");
      }
      setData((current) =>
        current
          ? {
              ...current,
              issues: current.issues.map((issue) =>
                issue.id === issueId ? { ...issue, votes: result.count! } : issue,
              ),
            }
          : current,
      );
    } catch {
      setVoted((current) => {
        const next = new Set(current);
        next.delete(issueId);
        localStorage.setItem(VOTED_KEY, JSON.stringify([...next]));
        return next;
      });
      setData((current) =>
        current
          ? {
              ...current,
              issues: current.issues.map((issue) =>
                issue.id === issueId
                  ? { ...issue, votes: Math.max(0, issue.votes - 1) }
                  : issue,
              ),
            }
          : current,
      );
      setError("Your vote did not save. Please try again.");
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(issueId);
        return next;
      });
    }
  }

  return (
    <main className="surface vote-surface">
      <header className="vote-header">
        <a className="factory-mark compact" href="/wall"><span>F</span> FACTORY</a>
        <p className="eyebrow">YOU SET THE PRIORITY</p>
        <h1 aria-label="What should we build next?">WHAT SHOULD<br />WE BUILD NEXT?</h1>
        <p className="vote-intro">
          Every idea below is a real ticket. Vote, and an autonomous Droid takes
          it from there: it picks the ticket up from Linear, writes the code,
          runs the tests, and ships it to the wall. Nobody at this booth touches
          a keyboard.
        </p>
        <ol className="installation-flow" aria-label="How your vote reaches the wall">
          <li><span>01</span><strong>You vote</strong></li>
          <li><span>02</span><strong>A Droid claims the ticket</strong></li>
          <li><span>03</span><strong>Code, tests, and checks</strong></li>
          <li><span>04</span><strong>Live on the wall</strong></li>
        </ol>
        <p className="shipped-today" aria-live="polite">
          <span className="signal-dot" />
          This booth has shipped {mergedToday} changes today
        </p>
      </header>
      {error && <div className="vote-alert" role="alert">{error}</div>}
      {!data && !error && <div className="system-state">Loading the live ballot...</div>}
      {data && !data.configured && (
        <div className="system-state"><strong>VOTING OPENS SOON</strong><span>{data.message}</span></div>
      )}
      {data?.configured && data.issues.length === 0 && (
        <div className="system-state">No ideas are in the backlog right now.</div>
      )}
      <section className="ballot" aria-label="Ideas open for voting">
        {data?.issues.map((issue, index) => (
          <article className="ballot-card" key={issue.id}>
            <div className="rank">{String(index + 1).padStart(2, "0")}</div>
            <div className="ballot-copy">
              <span>{issue.identifier}</span>
              <h2>{issue.title}</h2>
            </div>
            <div className="vote-count"><strong>{issue.votes}</strong><span>VOTES</span></div>
            <button
              type="button"
              disabled={voted.has(issue.id) || pending.has(issue.id)}
              onClick={() => castVote(issue.id)}
            >
              {voted.has(issue.id) ? "VOTED" : "VOTE +1"}
            </button>
          </article>
        ))}
      </section>
      <footer className="vote-footer">Votes promote one backlog idea every cycle.</footer>
    </main>
  );
}
