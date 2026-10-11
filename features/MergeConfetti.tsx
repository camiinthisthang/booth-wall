"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { GitHubSummary } from "@/lib/github";

const POLL_MS = 20000;
const CELEBRATION_MS = 2600;
const MAX_QUEUED = 3;
const PIECE_COUNT = 36;
const COLORS = ["#ff4b24", "#ff6a3d", "#f2efe7", "#9d9a94"] as const;

interface Merge {
  number: number;
  title: string;
  mergedAt: string;
}

interface Piece {
  dx: number;
  dy: number;
  fall: number;
  size: number;
  delay: number;
  color: string;
}

// Seeded so a given merge always produces the same burst.
function burstFor(seed: number): Piece[] {
  let state = (seed * 2654435761) >>> 0 || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  return Array.from({ length: PIECE_COUNT }, (_, index) => {
    const angle = (index / PIECE_COUNT) * Math.PI * 2 + next() * 0.5;
    const reach = 18 + next() * 26;
    return {
      dx: Math.round(Math.cos(angle) * reach),
      dy: Math.round(Math.sin(angle) * reach * 0.8 - 10),
      fall: Math.round(18 + next() * 22),
      size: 2 + Math.round(next() * 2),
      delay: Math.round(next() * 220),
      color: COLORS[index % COLORS.length],
    };
  });
}

const mergeKey = (merge: Merge) => `${merge.number}:${merge.mergedAt}`;

const labelSize = "clamp(0.45rem, min(0.62vw, 1.1vh), 1.2rem)";
const countSize = "clamp(1.2rem, min(2.6vw, 4.6vh), 5rem)";
const noteSize = "clamp(0.5rem, min(0.72vw, 1.28vh), 1.4rem)";

// The wall grid styles `.feature-cell > div`, so layout is pinned inline and
// keyframes live in a scoped style tag to keep the feature in one file.
const styles = `
.booth-confetti-piece {
  position: absolute;
  left: 50%;
  top: 45%;
  opacity: 0;
  animation: booth-confetti-burst ${CELEBRATION_MS - 300}ms steps(14, end) both;
}

.booth-confetti-flash {
  animation: booth-confetti-flash 900ms steps(6, end) both;
}

@keyframes booth-confetti-burst {
  0% { opacity: 1; transform: translate(-50%, -50%); }
  35% { opacity: 1; transform: translate(calc(-50% + var(--dx) * 1cqw), calc(-50% + var(--dy) * 1cqh)); }
  100% { opacity: 0; transform: translate(calc(-50% + var(--dx) * 1.2cqw), calc(-50% + (var(--dy) + var(--fall)) * 1cqh)); }
}

@keyframes booth-confetti-flash {
  0%, 50% { color: #ff4b24; }
  100% { color: #f2efe7; }
}

@media (prefers-reduced-motion: reduce) {
  .booth-confetti-piece {
    animation: none;
    opacity: 1;
    transform: translate(calc(-50% + var(--dx) * 1cqw), calc(-50% + var(--dy) * 1cqh));
  }

  .booth-confetti-flash {
    animation: none;
  }
}
`;

export function MergeConfetti() {
  const [mergedToday, setMergedToday] = useState<number | null>(null);
  const [queue, setQueue] = useState<Merge[]>([]);
  const seen = useRef<{ count: number; latestKey: string | null } | null>(null);

  useEffect(() => {
    let controller: AbortController | null = null;

    const poll = async () => {
      if (document.hidden) return;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/github/summary", {
          signal: controller.signal,
          cache: "no-store",
        });
        // Failure responses report a zero count, which must not reset the baseline.
        if (!response.ok) return;
        const summary = (await response.json()) as GitHubSummary;
        if (!summary.configured || typeof summary.mergedToday !== "number") return;

        const latest: Merge | null = summary.latest
          ? {
              number: summary.latest.number,
              title: summary.latest.title,
              mergedAt: summary.latest.mergedAt,
            }
          : null;
        const latestKey = latest ? mergeKey(latest) : null;
        const previous = seen.current;
        seen.current = { count: summary.mergedToday, latestKey };
        setMergedToday(summary.mergedToday);

        // The first reading is a baseline. Afterwards a celebration needs both a
        // higher count and a new latest merge, so one merge plays exactly once
        // even if the count moves by more than one for it.
        if (
          previous &&
          latest &&
          summary.mergedToday > previous.count &&
          latestKey !== previous.latestKey
        ) {
          setQueue((current) =>
            current.some((merge) => mergeKey(merge) === latestKey)
              ? current
              : [...current, latest].slice(-MAX_QUEUED),
          );
        }
      } catch {
        // Keep the last known state when the network drops.
      }
    };

    void poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      window.clearInterval(timer);
      controller?.abort();
    };
  }, []);

  const active = queue[0] ?? null;

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(
      () => setQueue((current) => current.slice(1)),
      CELEBRATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [active]);

  const pieces = active ? burstFor(active.number) : [];

  return (
    <div
      role="region"
      aria-label="Merge confetti"
      style={{
        position: "relative",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "0.4em",
        padding: "7% 8%",
        border: `1px solid ${active ? "#ff4b24" : "#262626"}`,
        background: "#0d0d0d",
        color: "#f2efe7",
        overflow: "hidden",
        containerType: "size",
      }}
    >
      <style>{styles}</style>
      <p
        style={{
          margin: 0,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: labelSize,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#ff6a3d",
        }}
      >
        Merge confetti
      </p>
      <p
        key={active ? mergeKey(active) : "idle"}
        className={active ? "booth-confetti-flash" : undefined}
        style={{
          position: "relative",
          zIndex: 1,
          margin: 0,
          fontSize: countSize,
          fontWeight: 600,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {mergedToday === null ? "--" : String(mergedToday).padStart(2, "0")}
      </p>
      <p
        aria-live="polite"
        style={{
          position: "relative",
          zIndex: 1,
          margin: 0,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: noteSize,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: active ? "#f2efe7" : "#9d9a94",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {active ? `Merged #${active.number} ${active.title}` : "Waiting for the next merge"}
      </p>
      {active ? (
        <div aria-hidden="true" key={mergeKey(active)} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {pieces.map((piece, index) => (
            <i
              key={index}
              className="booth-confetti-piece"
              style={
                {
                  width: `${piece.size}cqmin`,
                  height: `${piece.size}cqmin`,
                  background: piece.color,
                  animationDelay: `${piece.delay}ms`,
                  "--dx": piece.dx,
                  "--dy": piece.dy,
                  "--fall": piece.fall,
                } as CSSProperties
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
