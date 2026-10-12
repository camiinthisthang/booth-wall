"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  unseenMergeEvents,
  type CaughtAtGateData,
  type MergeEvent,
} from "@/lib/caught-at-gate";

const POLL_MS = 20_000;
const CELEBRATION_MS = 2_800;
const PIECE_COUNT = 72;
const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
const colors = ["#ff4b24", "#ff6a3d", "#ffb627", "#f2efe7"] as const;

type ApiResponse =
  | ({ configured: true } & CaughtAtGateData)
  | { configured: false; message: string };

function useGateData() {
  const [response, setResponse] = useState<ApiResponse | null>(null);

  useEffect(() => {
    let controller: AbortController | null = null;
    const poll = async () => {
      if (document.hidden) return;
      controller?.abort();
      controller = new AbortController();
      try {
        const request = await fetch("/api/caught-at-gate", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!request.ok) return;
        setResponse((await request.json()) as ApiResponse);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // Keep the last real gate history visible through transient failures.
        }
      }
    };
    void poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      controller?.abort();
      window.clearInterval(timer);
    };
  }, []);

  return response;
}

export function CaughtAtGate() {
  const response = useGateData();
  const data = response?.configured ? response : null;

  return (
    <div
      role="region"
      aria-label="Caught at the Gate"
      style={{
        height: "100%",
        display: "grid",
        gridTemplateRows: "auto auto 1fr",
        gap: "0.42em",
        padding: "7% 8%",
        border: `1px solid ${data?.count ? "#ff4b24" : "#262626"}`,
        background: "#0d0d0d",
        color: "#f2efe7",
        overflow: "hidden",
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: mono,
          fontSize: "clamp(0.45rem, min(0.62vw, 1.1vh), 1.2rem)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#ff6a3d",
        }}
      >
        Caught at the Gate
      </p>
      <p
        style={{
          margin: 0,
          fontSize: "clamp(0.66rem, min(1.02vw, 1.8vh), 1.9rem)",
          fontWeight: 650,
          lineHeight: 1.1,
        }}
      >
        Problems stopped before reaching this wall:{" "}
        <span
          style={{
            color: "#ffb627",
            fontFamily: mono,
            fontSize: "1.5em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {data ? data.count : "·"}
        </span>
      </p>
      <div
        aria-live="polite"
        style={{
          minHeight: 0,
          overflow: "hidden",
          fontFamily: mono,
          fontSize: "clamp(0.42rem, min(0.58vw, 1.02vh), 1.1rem)",
          lineHeight: 1.35,
          color: "#9d9a94",
        }}
      >
        {data?.problems.length ? (
          data.problems.slice(0, 2).map((problem) => (
            <p
              key={`${problem.pullNumber}:${problem.checkName}`}
              style={{
                margin: "0 0 0.24em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              <span style={{ color: "#ff8f82" }}>FAIL</span>{" "}
              {problem.checkName} on #{problem.pullNumber}{" "}
              <span style={{ color: "#8ff0a4" }}>FIXED</span>
            </p>
          ))
        ) : (
          <p style={{ margin: 0 }}>
            {response === null
              ? "Reading required check history"
              : response.configured
                ? data?.requiredChecks.length
                  ? "No required check has failed and recovered before merge"
                  : "No required checks are configured"
                : response.message}
          </p>
        )}
      </div>
    </div>
  );
}

interface Piece {
  x: number;
  delay: number;
  duration: number;
  drift: number;
  size: number;
  color: string;
}

function confettiFor(seed: number): Piece[] {
  let state = (seed * 2654435761) >>> 0 || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  return Array.from({ length: PIECE_COUNT }, (_, index) => ({
    x: next() * 100,
    delay: Math.round(next() * 500),
    duration: 1700 + Math.round(next() * 700),
    drift: Math.round((next() - 0.5) * 30),
    size: 5 + Math.round(next() * 7),
    color: colors[index % colors.length],
  }));
}

const overlayStyles = `
.booth-merge-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  pointer-events: none;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 32%);
  animation: booth-merge-overlay-flash ${CELEBRATION_MS}ms steps(10, end) both;
}

.booth-merge-banner {
  padding: 0.45em 0.7em;
  border: 2px solid #ff4b24;
  background: #0d0d0d;
  color: #f2efe7;
  font: 700 clamp(1.2rem, 5vw, 6rem)/1 ${mono};
  letter-spacing: -0.04em;
  text-align: center;
  text-transform: uppercase;
  box-shadow: 12px 12px 0 #ff4b24;
}

.booth-merge-piece {
  position: absolute;
  top: -5vh;
  animation: booth-merge-piece-fall var(--duration)ms steps(16, end) var(--delay)ms both;
}

@keyframes booth-merge-overlay-flash {
  0%, 10% { opacity: 0; }
  18%, 75% { opacity: 1; }
  100% { opacity: 0; }
}

@keyframes booth-merge-piece-fall {
  0% { transform: translate(0, -8vh) rotate(0deg); }
  100% { transform: translate(var(--drift), 112vh) rotate(720deg); }
}

@media (prefers-reduced-motion: reduce) {
  .booth-merge-overlay {
    animation: none;
  }

  .booth-merge-piece {
    animation: none;
    top: var(--static-y);
    transform: rotate(18deg);
  }
}
`;

const mergeKey = (merge: MergeEvent) => `${merge.number}:${merge.mergedAt}`;

export function MergeCelebrationOverlay() {
  const response = useGateData();
  const [queue, setQueue] = useState<MergeEvent[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const merges = response?.configured ? response.recentMerges : null;

  useEffect(() => {
    if (!merges) return;
    const nextKeys = new Set(merges.map(mergeKey));
    if (seen.current === null) {
      seen.current = nextKeys;
      return;
    }
    const fresh = unseenMergeEvents(seen.current, merges);
    seen.current = new Set([...seen.current, ...nextKeys]);
    if (fresh.length > 0) {
      setQueue((current) => [...current, ...fresh]);
    }
  }, [merges]);

  const active = queue[0] ?? null;

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(
      () => setQueue((current) => current.slice(1)),
      CELEBRATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [active]);

  const pieces = useMemo(
    () => (active ? confettiFor(active.number) : []),
    [active],
  );

  if (!active) return null;

  return (
    <div
      className="booth-merge-overlay"
      role="status"
      aria-label={`Pull request ${active.number} merged`}
      key={mergeKey(active)}
    >
      <style>{overlayStyles}</style>
      <p className="booth-merge-banner">
        Merged #{active.number}
      </p>
      <div aria-hidden="true">
        {pieces.map((piece, index) => (
          <i
            className="booth-merge-piece"
            key={index}
            style={
              {
                left: `${piece.x}%`,
                width: piece.size,
                height: piece.size * 1.6,
                background: piece.color,
                "--delay": piece.delay,
                "--duration": piece.duration,
                "--drift": `${piece.drift}vw`,
                "--static-y": `${8 + ((index * 17) % 84)}vh`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
