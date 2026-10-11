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
  startViewTransition?: (update: () => void) => unknown;
};

export function Board() {
  const [snapshot, setSnapshot] = useState<BoardResponse | null>(null);
  const [stale, setStale] = useState(false);
  const inFlight = useRef(false);
  const hasSnapshot = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch("/api/board", { cache: "no-store" });
      if (!response.ok) throw new Error("Board refresh failed");
      const nextSnapshot = (await response.json()) as BoardResponse;
      const applySnapshot = () => {
        setSnapshot(nextSnapshot);
        setStale(false);
        hasSnapshot.current = true;
      };
      const transitionDocument = document as ViewTransitionDocument;
      if (
        hasSnapshot.current &&
        transitionDocument.startViewTransition &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        transitionDocument.startViewTransition(applySnapshot);
      } else {
        applySnapshot();
      }
    } catch {
      setStale(true);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 10_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  return (
    <main className="surface board-surface">
      <header className="surface-header">
        <div>
          <p className="eyebrow">FACTORY / LIVE QUEUE</p>
          <h1>BUILD BOARD</h1>
        </div>
        <div className="header-actions">
          {stale && <span className="status-chip warning">STALE SNAPSHOT</span>}
          <span className="status-chip">REFRESH 10S</span>
          <a className="text-link" href="/wall">Wall</a>
        </div>
      </header>

      {!snapshot && !stale && <div className="system-state">Loading build queue...</div>}
      {!snapshot && stale && <div className="system-state">The build queue is temporarily unavailable.</div>}
      {snapshot && !snapshot.configured && (
        <div className="system-state">
          <strong>LINEAR NOT CONNECTED</strong>
          <span>{snapshot.message}</span>
        </div>
      )}
      {snapshot?.configured && snapshot.issues.length === 0 && (
        <div className="system-state">The Booth team has no active issues.</div>
      )}

      {snapshot?.configured && snapshot.issues.length > 0 && (
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
