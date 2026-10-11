"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { BoothIssue } from "@/lib/linear";

const POLL_MS = 15000;

type BoardResponse = {
  configured: boolean;
  issues: BoothIssue[];
  message?: string;
};

type Pulse =
  | { kind: "loading" }
  | { kind: "offline"; message: string }
  | { kind: "idle" }
  | { kind: "active"; inProgress: number; inReview: number };

function readPulse(issues: BoothIssue[]): Pulse {
  const inProgress = issues.filter((issue) => issue.state === "In Progress").length;
  const inReview = issues.filter((issue) => issue.state === "In Review").length;
  return inProgress + inReview > 0 ? { kind: "active", inProgress, inReview } : { kind: "idle" };
}

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
const labelSize = "clamp(0.45rem, min(0.62vw, 1.1vh), 1.2rem)";
const stateSize = "clamp(0.9rem, min(1.7vw, 3vh), 3.2rem)";
const noteSize = "clamp(0.5rem, min(0.72vw, 1.28vh), 1.4rem)";

// The wall grid styles `.feature-cell > div`, so layout is pinned inline and
// keyframes live in a scoped style tag to keep the feature in one file.
const styles = `
.booth-pulse-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid #ff4b24;
  opacity: 0;
  animation: booth-pulse-ring var(--pulse-ms) cubic-bezier(0.2, 0.6, 0.3, 1) infinite;
}

.booth-pulse-core-active {
  animation: booth-pulse-core var(--pulse-ms) ease-in-out infinite;
}

.booth-pulse-core-idle {
  animation: booth-pulse-idle 4800ms ease-in-out infinite;
}

@keyframes booth-pulse-ring {
  0% { opacity: 0.85; transform: scale(0.35); }
  100% { opacity: 0; transform: scale(1); }
}

@keyframes booth-pulse-core {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 75, 36, 0.55); }
  20% { transform: scale(1.12); box-shadow: 0 0 2.5cqmin 0.6cqmin rgba(255, 75, 36, 0.45); }
}

@keyframes booth-pulse-idle {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 0.8; }
}

@media (prefers-reduced-motion: reduce) {
  .booth-pulse-ring,
  .booth-pulse-core-active,
  .booth-pulse-core-idle {
    animation: none;
  }

  .booth-pulse-ring:first-child {
    opacity: 0.6;
    transform: scale(0.7);
  }
}
`;

function describe(pulse: Pulse): { state: string; detail: string } {
  switch (pulse.kind) {
    case "loading":
      return { state: "Listening", detail: "Checking the build floor" };
    case "offline":
      return { state: "Offline", detail: pulse.message };
    case "idle":
      return { state: "Idle", detail: "No builds running" };
    case "active":
      return {
        state: `Active ${String(pulse.inProgress + pulse.inReview).padStart(2, "0")}`,
        detail: `${pulse.inProgress} building / ${pulse.inReview} in review`,
      };
  }
}

export function BuildPulse() {
  const [pulse, setPulse] = useState<Pulse>({ kind: "loading" });

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
          setPulse({
            kind: "offline",
            message: board.message ?? "Connect Linear to read build activity",
          });
          return;
        }
        setPulse(readPulse(Array.isArray(board.issues) ? board.issues : []));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // A failed refresh keeps the last real reading instead of flashing idle.
        setPulse((current) =>
          current.kind === "loading"
            ? { kind: "offline", message: "Build activity is temporarily unavailable" }
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

  const active = pulse.kind === "active";
  const total = active ? pulse.inProgress + pulse.inReview : 0;
  // More concurrent builds beat faster, bounded so the wall never strobes.
  const pulseMs = active ? Math.max(1100, 2200 - (total - 1) * 300) : 0;
  const { state, detail } = describe(pulse);

  return (
    <div
      role="region"
      aria-label="Build pulse"
      data-pulse-state={pulse.kind}
      style={{
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
          fontFamily: mono,
          fontSize: labelSize,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#ff6a3d",
        }}
      >
        Build pulse
      </p>
      <div
        aria-hidden="true"
        style={
          {
            position: "relative",
            alignSelf: "center",
            width: "min(46cqmin, 60cqh)",
            aspectRatio: "1",
            flex: "0 0 auto",
            display: "grid",
            placeItems: "center",
            "--pulse-ms": `${pulseMs}ms`,
          } as CSSProperties
        }
      >
        {active ? (
          [0, 1, 2].map((index) => (
            <i
              key={index}
              className="booth-pulse-ring"
              style={{ animationDelay: `${(pulseMs / 3) * index}ms` }}
            />
          ))
        ) : (
          <i
            style={{
              position: "absolute",
              inset: "15%",
              borderRadius: "50%",
              border: "1px dashed #3a3a3a",
            }}
          />
        )}
        <i
          className={active ? "booth-pulse-core-active" : pulse.kind === "idle" ? "booth-pulse-core-idle" : undefined}
          style={{
            width: "26%",
            aspectRatio: "1",
            borderRadius: "50%",
            background: active ? "#ff4b24" : pulse.kind === "idle" ? "#6e6e6e" : "#2e2e2e",
          }}
        />
      </div>
      <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: "0.25em", minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontFamily: mono,
            fontSize: stateSize,
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: active ? "#ff4b24" : "#9d9a94",
          }}
        >
          {state}
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: mono,
            fontSize: noteSize,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: active ? "#f2efe7" : "#9d9a94",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {detail}
        </p>
      </div>
    </div>
  );
}
