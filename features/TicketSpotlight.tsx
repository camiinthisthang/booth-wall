"use client";

import { useEffect, useState } from "react";
import { agentDisplay, type BoothIssue } from "@/lib/linear";

const POLL_MS = 15000;

type BoardResponse = {
  configured: boolean;
  issues: BoothIssue[];
  message?: string;
};

type Spotlight =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "not-configured"; message: string }
  | { kind: "empty" }
  | { kind: "issue"; issue: BoothIssue; owner: string; total: number };

// The longest-running ticket stays featured until it leaves the lane, so the
// spotlight does not jump around on every refresh.
function pickSpotlight(issues: BoothIssue[]): Spotlight {
  const inProgress = issues
    .filter((issue) => issue.state === "In Progress")
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
        a.identifier.localeCompare(b.identifier, undefined, { numeric: true }),
    );
  const issue = inProgress[0];
  if (!issue) return { kind: "empty" };
  return {
    kind: "issue",
    issue,
    owner: agentDisplay(issue) ?? "Unassigned",
    total: inProgress.length,
  };
}

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
const labelSize = "clamp(0.45rem, min(0.62vw, 1.1vh), 1.2rem)";
const idSize = "clamp(1rem, min(2.2vw, 4vh), 4.2rem)";
const titleSize = "clamp(0.6rem, min(1.05vw, 1.9vh), 2rem)";
const noteSize = "clamp(0.5rem, min(0.72vw, 1.28vh), 1.4rem)";

const label = {
  margin: 0,
  fontFamily: mono,
  fontSize: labelSize,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#ff6a3d",
} as const;

const note = {
  margin: 0,
  fontFamily: mono,
  fontSize: noteSize,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#9d9a94",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

export function TicketSpotlight() {
  const [spotlight, setSpotlight] = useState<Spotlight>({ kind: "loading" });

  useEffect(() => {
    let controller: AbortController | null = null;

    const poll = async () => {
      if (document.hidden) return;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/board", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Board request failed");
        const board = (await response.json()) as BoardResponse;
        if (!board.configured) {
          setSpotlight({
            kind: "not-configured",
            message: board.message ?? "Connect Linear to spotlight live work",
          });
          return;
        }
        setSpotlight(pickSpotlight(Array.isArray(board.issues) ? board.issues : []));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Keep the last real spotlight on screen when a refresh fails.
        setSpotlight((current) =>
          current.kind === "loading" ? { kind: "unavailable" } : current,
        );
      }
    };

    void poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      window.clearInterval(timer);
      controller?.abort();
    };
  }, []);

  const active = spotlight.kind === "issue";

  return (
    <div
      role="region"
      aria-label="Ticket spotlight"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "0.4em",
        padding: "5% 6%",
        border: `1px solid ${active ? "#ff4b24" : "#262626"}`,
        background: "#0d0d0d",
        color: "#f2efe7",
        overflow: "hidden",
      }}
    >
      <p style={label}>Ticket spotlight</p>
      {spotlight.kind === "issue" ? (
        <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: "0.35em", minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontFamily: mono,
              fontSize: idSize,
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: "0.04em",
              color: "#ff4b24",
            }}
          >
            {spotlight.issue.identifier}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: titleSize,
              lineHeight: 1.2,
              color: "#f2efe7",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {spotlight.issue.title}
          </p>
          <p style={{ ...note, color: "#f2efe7" }}>Owner: {spotlight.owner}</p>
        </div>
      ) : (
        <p aria-live="polite" style={{ ...note, fontSize: titleSize, whiteSpace: "normal" }}>
          {spotlight.kind === "loading" && "Looking for live work"}
          {spotlight.kind === "unavailable" && "The build queue is temporarily unavailable"}
          {spotlight.kind === "not-configured" && spotlight.message}
          {spotlight.kind === "empty" && "Nothing in progress. The next ticket is on deck."}
        </p>
      )}
      <p style={note}>
        {spotlight.kind === "issue"
          ? spotlight.total > 1
            ? `In progress / 1 of ${spotlight.total}`
            : "In progress"
          : spotlight.kind === "empty"
            ? "In progress lane empty"
            : "In progress"}
      </p>
    </div>
  );
}
