"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { agentDisplay, BOARD_LANES, type BoothIssue } from "@/lib/linear";

type BoardResponse = {
  configured: boolean;
  issues: BoothIssue[];
  message?: string;
  fetchedAt?: string;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => {
    finished: Promise<void>;
  };
};

type BoardFailure = "disconnected" | "error";

type BoardView = "loading" | BoardFailure | "not-configured" | "empty" | "ready";

const REFRESH_MS = 10_000;
// Without a timeout a hung request keeps `inFlight` set and silently freezes every later refresh.
const REQUEST_TIMEOUT_MS = 8_000;

const STATE_COPY: Record<Exclude<BoardView, "ready" | "not-configured">, { title: string; detail: string }> = {
  loading: {
    title: "LOADING BUILD QUEUE",
    detail: "Fetching the latest Booth issues from Linear.",
  },
  disconnected: {
    title: "BOARD OFFLINE",
    detail: "This screen cannot reach the booth server. Check the network; the board reconnects on its own.",
  },
  error: {
    title: "BOARD ERROR",
    detail: "The booth server could not load the queue from Linear. Retry now, or check the Linear integration if this persists.",
  },
  empty: {
    title: "QUEUE CLEAR",
    detail: "No active Booth issues right now. Cast a vote to promote the next build.",
  },
};

const STALE_REASON: Record<BoardFailure, string> = {
  disconnected: "Connection lost.",
  error: "Linear refresh failed.",
};

const HEADER_CHIP: Record<BoardFailure, string> = {
  disconnected: "OFFLINE",
  error: "REFRESH FAILED",
};

const actionStyle: CSSProperties = {
  border: "1px solid var(--line)",
  background: "transparent",
  color: "var(--paper)",
  padding: "0.65em 1em",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.75rem",
  letterSpacing: "0.1em",
  textDecoration: "none",
  cursor: "pointer",
};

const staleBannerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  marginBottom: "0.9rem",
  border: "1px solid var(--amber)",
  padding: "0.75rem 1rem",
  color: "var(--amber)",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.8rem",
};

function isBoardResponse(value: unknown): value is BoardResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BoardResponse>;
  return typeof candidate.configured === "boolean" && Array.isArray(candidate.issues);
}

async function fetchBoard(signal: AbortSignal): Promise<BoardResponse | BoardFailure> {
  let response: Response;
  try {
    response = await fetch("/api/board", { cache: "no-store", signal });
  } catch {
    return "disconnected";
  }
  if (!response.ok) return "error";
  try {
    const body: unknown = await response.json();
    return isBoardResponse(body) ? body : "error";
  } catch {
    return signal.aborted ? "disconnected" : "error";
  }
}

function formatSnapshotTime(fetchedAt: string | undefined): string | null {
  if (!fetchedAt) return null;
  const time = new Date(fetchedAt);
  if (Number.isNaN(time.getTime()) || time.getTime() === 0) return null;
  return time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function Board() {
  const [snapshot, setSnapshot] = useState<BoardResponse | null>(null);
  const [failure, setFailure] = useState<BoardFailure | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const hasSnapshot = useRef(false);
  const unmounted = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const result = await fetchBoard(controller.signal);
      if (unmounted.current) return;
      if (typeof result === "string") {
        setFailure(result);
        return;
      }
      const applySnapshot = () => {
        setSnapshot(result);
        setFailure(null);
        hasSnapshot.current = true;
      };
      const transitionDocument = document as ViewTransitionDocument;
      if (
        hasSnapshot.current &&
        transitionDocument.startViewTransition &&
        document.visibilityState === "visible" &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        transitionDocument
          .startViewTransition(applySnapshot)
          .finished.catch(() => undefined);
      } else {
        applySnapshot();
      }
    } finally {
      window.clearTimeout(timeout);
      inFlight.current = null;
    }
  }, []);

  const retry = useCallback(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    unmounted.current = false;
    const initial = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, REFRESH_MS);
    const handleOnline = () => {
      void refresh();
    };
    const handleOffline = () => setFailure("disconnected");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      unmounted.current = true;
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      inFlight.current?.abort();
    };
  }, [refresh]);

  const view: BoardView = !snapshot
    ? (failure ?? "loading")
    : !snapshot.configured
      ? "not-configured"
      : snapshot.issues.length === 0
        ? "empty"
        : "ready";
  const stale = snapshot !== null && failure !== null;
  const snapshotTime = snapshot?.configured ? formatSnapshotTime(snapshot.fetchedAt) : null;

  return (
    <main className="surface board-surface" data-board-state={stale ? "stale" : view}>
      <header className="surface-header">
        <div>
          <p className="eyebrow">FACTORY / LIVE QUEUE</p>
          <h1>BUILD BOARD</h1>
        </div>
        <div className="header-actions">
          {stale && <span className="status-chip warning">STALE SNAPSHOT</span>}
          {!snapshot && failure && <span className="status-chip warning">{HEADER_CHIP[failure]}</span>}
          <span className="status-chip">REFRESH 10S</span>
          <a className="text-link" href="/wall">Wall</a>
        </div>
      </header>

      {stale && failure && (
        <div role="status" style={staleBannerStyle} data-board-banner="stale">
          <span>
            {snapshotTime ? `Showing the last good board from ${snapshotTime}. ` : "Showing the last good board. "}
            {STALE_REASON[failure]} Retrying every 10 seconds.
          </span>
          <button type="button" style={actionStyle} onClick={retry}>
            RETRY NOW
          </button>
        </div>
      )}

      {view === "loading" && (
        <div className="system-state" role="status" aria-busy="true">
          <strong>{STATE_COPY.loading.title}</strong>
          <span>{STATE_COPY.loading.detail}</span>
        </div>
      )}
      {(view === "disconnected" || view === "error") && (
        <div className="system-state" role="alert">
          <strong>{STATE_COPY[view].title}</strong>
          <span>{STATE_COPY[view].detail}</span>
          <button type="button" style={actionStyle} onClick={retry}>
            RETRY NOW
          </button>
        </div>
      )}
      {view === "not-configured" && snapshot && (
        <div className="system-state" role="status">
          <strong>LINEAR NOT CONNECTED</strong>
          <span>{snapshot.message ?? "Connect Linear to load the live build board."}</span>
          <span>Add the Linear server settings to this deployment, then reload the board.</span>
        </div>
      )}
      {view === "empty" && (
        <div className="system-state" role="status">
          <strong>{STATE_COPY.empty.title}</strong>
          <span>{STATE_COPY.empty.detail}</span>
          <a style={actionStyle} href="/vote">
            OPEN THE BALLOT
          </a>
        </div>
      )}

      {view === "ready" && snapshot && (
        <section className="board-lanes" aria-label="Linear workflow board">
          {BOARD_LANES.map((lane) => {
            const issues = snapshot.issues.filter((issue) => issue.state === lane);
            return (
              <div className="board-lane" key={lane}>
                <header>
                  <h2>{lane}</h2>
                  <span>{issues.length.toString().padStart(2, "0")}</span>
                </header>
                <div className="lane-cards">
                  {issues.map((issue) => {
                    const owner = agentDisplay(issue);
                    return (
                      <article
                        className="issue-card"
                        key={issue.id}
                        style={{ viewTransitionName: `issue-${issue.id}` } as CSSProperties}
                      >
                        <span className="issue-id">{issue.identifier}</span>
                        <h3>{issue.title}</h3>
                        <div className="issue-labels">
                          {issue.labels.slice(0, 2).map((label) => <span key={label}>{label}</span>)}
                        </div>
                        <footer>{owner ?? "Unassigned"}</footer>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
