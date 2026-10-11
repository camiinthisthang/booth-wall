"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { BoothIssue } from "@/lib/linear";

const POLL_MS = 15000;
const MAX_ITEMS = 12;
// A short list is repeated within each copy so one copy is always wider than
// the cell; otherwise the belt would show a blank stretch before it wraps.
const MIN_ENTRIES = 8;
// Constant scroll speed regardless of how many titles are on the belt.
const MS_PER_ITEM = 4500;

type BoardResponse = {
  configured: boolean;
  issues: BoothIssue[];
  message?: string;
};

type Ticker =
  | { kind: "loading" }
  | { kind: "offline"; message: string }
  | { kind: "empty" }
  | { kind: "shipped"; issues: BoothIssue[] };

// The board payload has no completion timestamp, so the newest Done tickets
// stand in for the most recently shipped work.
function readShipped(issues: BoothIssue[]): Ticker {
  const shipped = issues
    .filter((issue) => issue.state === "Done")
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
        b.identifier.localeCompare(a.identifier, undefined, { numeric: true }),
    )
    .slice(0, MAX_ITEMS);
  return shipped.length > 0 ? { kind: "shipped", issues: shipped } : { kind: "empty" };
}

function sameIssues(a: BoothIssue[], b: BoothIssue[]): boolean {
  return (
    a.length === b.length &&
    a.every((issue, index) => issue.id === b[index].id && issue.title === b[index].title)
  );
}

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
const labelSize = "clamp(0.45rem, min(0.62vw, 1.1vh), 1.2rem)";
const itemSize = "clamp(0.6rem, min(1.05vw, 1.9vh), 2rem)";
const noteSize = "clamp(0.5rem, min(0.72vw, 1.28vh), 1.4rem)";

// The wall grid styles `.feature-cell > div`, `strong`, and `span`, so layout
// is pinned inline, only p/div are used, and keyframes live in a scoped style
// tag to keep the feature in one file.
const styles = `
.booth-ticker-track {
  display: flex;
  width: max-content;
  animation: booth-ticker-scroll var(--ticker-ms) linear infinite;
  will-change: transform;
}

@keyframes booth-ticker-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

@media (prefers-reduced-motion: reduce) {
  .booth-ticker-track {
    animation: none;
    transform: none;
  }
}
`;

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

// Each item carries its own trailing space so two copies of the list are
// exactly twice as wide as one, which makes the -50% loop seamless.
const item = {
  display: "flex",
  alignItems: "baseline",
  gap: "0.6em",
  flexShrink: 0,
  paddingRight: "2.4em",
  margin: 0,
  fontSize: itemSize,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
  color: "#f2efe7",
} as const;

function beltEntries(issues: BoothIssue[]): BoothIssue[] {
  const repeats = Math.max(1, Math.ceil(MIN_ENTRIES / issues.length));
  return Array.from({ length: repeats }, () => issues).flat();
}

// Only the first pass of the first copy is exposed to assistive tech, so each
// shipped title is announced once.
function TickerItems({ issues, hidden }: { issues: BoothIssue[]; hidden?: boolean }) {
  const entries = beltEntries(issues);
  return (
    <div aria-hidden={hidden || undefined} style={{ display: "flex", flexShrink: 0 }}>
      {entries.map((issue, index) => (
        <p
          key={`${issue.id}-${index}`}
          aria-hidden={!hidden && index >= issues.length ? true : undefined}
          style={item}
        >
          <em style={{ fontStyle: "normal", fontFamily: mono, color: "#ff4b24", letterSpacing: "0.04em" }}>
            {issue.identifier}
          </em>
          <em style={{ fontStyle: "normal" }}>{issue.title}</em>
        </p>
      ))}
    </div>
  );
}

export function ShippedTicker() {
  const [ticker, setTicker] = useState<Ticker>({ kind: "loading" });

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
          setTicker({
            kind: "offline",
            message: board.message ?? "Connect Linear to list shipped work",
          });
          return;
        }
        const next = readShipped(Array.isArray(board.issues) ? board.issues : []);
        // Keep the same state object when nothing changed so the belt does not
        // restart its scroll on every poll.
        setTicker((current) =>
          current.kind === "shipped" && next.kind === "shipped" && sameIssues(current.issues, next.issues)
            ? current
            : next,
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // A failed refresh keeps the last real ticker instead of going blank.
        setTicker((current) =>
          current.kind === "loading"
            ? { kind: "offline", message: "Shipped work is temporarily unavailable" }
            : current,
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

  const shipped = ticker.kind === "shipped";
  const count = shipped ? ticker.issues.length : 0;

  return (
    <div
      role="region"
      aria-label="Shipped ticker"
      data-ticker-state={ticker.kind}
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "0.4em",
        padding: "4% 4%",
        border: `1px solid ${shipped ? "#3a2a24" : "#262626"}`,
        background: "#0d0d0d",
        color: "#f2efe7",
        overflow: "hidden",
      }}
    >
      <style>{styles}</style>
      <p style={label}>Shipped</p>
      {shipped ? (
        <div
          style={{
            overflow: "hidden",
            minWidth: 0,
            maskImage: "linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent)",
            WebkitMaskImage: "linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent)",
          }}
        >
          <div
            className="booth-ticker-track"
            style={{ "--ticker-ms": `${beltEntries(ticker.issues).length * MS_PER_ITEM}ms` } as CSSProperties}
          >
            <TickerItems issues={ticker.issues} />
            <TickerItems issues={ticker.issues} hidden />
          </div>
        </div>
      ) : (
        <p aria-live="polite" style={{ ...note, fontSize: itemSize, whiteSpace: "normal" }}>
          {ticker.kind === "loading" && "Checking the shipping dock"}
          {ticker.kind === "offline" && ticker.message}
          {ticker.kind === "empty" && "Nothing shipped yet. The first merge lands here."}
        </p>
      )}
      <p style={note}>
        {shipped ? `${count} recently shipped` : "Recently shipped"}
      </p>
    </div>
  );
}
