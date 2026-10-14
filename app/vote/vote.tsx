"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  DEFAULT_SCREEN_NAME,
  MAX_SCREEN_NAME_LENGTH,
  sanitizeScreenName,
} from "@/lib/vote-events";

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

type ShareStatus =
  | { kind: "idle" }
  | { kind: "sharing" }
  | { kind: "shared" }
  | { kind: "copied" }
  | { kind: "canceled" }
  | { kind: "manual"; url: string };

const VOTER_KEY = "booth-voter-id";
const VOTED_KEY = "booth-voted-issues";
const SCREEN_NAME_KEY = "booth-screen-name";
const SHARE_TITLE = "Vote on what Factory builds next";
const SHARE_TEXT = "Pick the next feature an autonomous Droid ships to the booth wall.";
const SHARE_NOTICE_MS = 5000;

const shareRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.75rem 1rem",
  marginTop: "1.5rem",
};

const shareButtonStyle: CSSProperties = {
  minHeight: "3.3rem",
  padding: "0 1.4rem",
  border: "1px solid var(--signal)",
  background: "transparent",
  color: "var(--paper)",
  fontSize: "0.78rem",
  fontWeight: 900,
  letterSpacing: "0.09em",
  cursor: "pointer",
};

const shareStatusStyle: CSSProperties = {
  flex: "1 1 14rem",
  margin: 0,
  color: "var(--soft)",
  fontSize: "0.9rem",
  lineHeight: 1.4,
};

const shareLinkStyle: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: "0.5rem",
  padding: "0.65rem 0.75rem",
  border: "1px solid var(--line)",
  background: "var(--panel)",
  color: "var(--paper)",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.85rem",
};

const screenNameStyle: CSSProperties = {
  display: "grid",
  gap: "0.45rem",
  maxWidth: "24rem",
  marginTop: "1.5rem",
};

const screenNameInputStyle: CSSProperties = {
  minHeight: "3.3rem",
  padding: "0 0.9rem",
  border: "1px solid var(--line)",
  background: "var(--panel)",
  color: "var(--paper)",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "1rem",
};

function browserVoterId() {
  let id = localStorage.getItem(VOTER_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VOTER_KEY, id);
  }
  return id;
}

function ballotUrl() {
  return new URL("/vote", window.location.origin).toString();
}

function isAbort(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

async function copyToClipboard(text: string) {
  if (!window.isSecureContext || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function shareMessage(status: ShareStatus) {
  switch (status.kind) {
    case "sharing":
      return "Opening share options...";
    case "shared":
      return "Thanks for sharing the ballot.";
    case "copied":
      return "Ballot link copied. Paste it anywhere to invite another vote.";
    case "canceled":
      return "Share canceled. Nothing was sent.";
    case "manual":
      return "Sharing is not available here. Copy this link to share the ballot:";
    default:
      return "";
  }
}

export function Vote() {
  const [data, setData] = useState<IssueResponse | null>(null);
  const [error, setError] = useState("");
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [mergedToday, setMergedToday] = useState(0);
  const [screenName, setScreenName] = useState(DEFAULT_SCREEN_NAME);
  const [shareStatus, setShareStatus] = useState<ShareStatus>({ kind: "idle" });

  useEffect(() => {
    if (
      shareStatus.kind !== "shared" &&
      shareStatus.kind !== "copied" &&
      shareStatus.kind !== "canceled"
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => setShareStatus({ kind: "idle" }),
      SHARE_NOTICE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [shareStatus]);

  useEffect(() => {
    const savedVoteTimer = window.setTimeout(() => {
      const saved = JSON.parse(localStorage.getItem(VOTED_KEY) ?? "[]") as string[];
      setVoted(new Set(saved));
      const savedName = localStorage.getItem(SCREEN_NAME_KEY);
      if (savedName !== null) {
        setScreenName(sanitizeScreenName(savedName));
      }
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

  async function shareBallot() {
    if (shareStatus.kind === "sharing") return;
    const url = ballotUrl();
    const payload: ShareData = { title: SHARE_TITLE, text: SHARE_TEXT, url };
    setShareStatus({ kind: "sharing" });

    const canNativeShare =
      typeof navigator.share === "function" &&
      (typeof navigator.canShare !== "function" || navigator.canShare(payload));
    if (canNativeShare) {
      try {
        await navigator.share(payload);
        setShareStatus({ kind: "shared" });
        return;
      } catch (shareError) {
        if (isAbort(shareError)) {
          setShareStatus({ kind: "canceled" });
          return;
        }
        // Any other rejection (for example NotAllowedError) falls back to copying.
      }
    }

    if (await copyToClipboard(url)) {
      setShareStatus({ kind: "copied" });
    } else {
      setShareStatus({ kind: "manual", url });
    }
  }

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
      const filteredName = sanitizeScreenName(screenName);
      setScreenName(filteredName);
      localStorage.setItem(SCREEN_NAME_KEY, filteredName);
      const response = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId,
          voterId: browserVoterId(),
          screenName: filteredName,
        }),
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
        <label style={screenNameStyle}>
          <span
            style={{
              color: "var(--signal-bright)",
              fontSize: "0.72rem",
              fontWeight: 900,
              letterSpacing: "0.12em",
            }}
          >
            SCREEN NAME <span style={{ color: "var(--soft)" }}>OPTIONAL</span>
          </span>
          <input
            type="text"
            maxLength={MAX_SCREEN_NAME_LENGTH}
            value={screenName}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setScreenName(value);
              localStorage.setItem(SCREEN_NAME_KEY, value);
            }}
            onBlur={() => {
              const filtered = sanitizeScreenName(screenName);
              setScreenName(filtered);
              localStorage.setItem(SCREEN_NAME_KEY, filtered);
            }}
            placeholder={DEFAULT_SCREEN_NAME}
            autoComplete="nickname"
            style={screenNameInputStyle}
          />
          <span style={{ color: "var(--soft)", fontSize: "0.78rem" }}>
            Shown on the live wall. Maximum {MAX_SCREEN_NAME_LENGTH} characters.
          </span>
        </label>
        <div style={shareRowStyle}>
          <button
            type="button"
            style={shareButtonStyle}
            onClick={shareBallot}
            disabled={shareStatus.kind === "sharing"}
            aria-describedby="ballot-share-status"
          >
            SHARE THIS BALLOT
          </button>
          <div id="ballot-share-status" role="status" style={shareStatusStyle}>
            {shareMessage(shareStatus)}
            {shareStatus.kind === "manual" && (
              <input
                type="text"
                readOnly
                aria-label="Ballot link"
                value={shareStatus.url}
                style={shareLinkStyle}
                onFocus={(event) => event.currentTarget.select()}
              />
            )}
          </div>
        </div>
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
