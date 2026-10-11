"use client";

import { useEffect, useState } from "react";

const FACTS = [
  "Droids pick up Linear tickets and turn them into pull requests.",
  "Every panel on this wall is built by a Droid, one ticket at a time.",
  "Visitors vote on which ticket a Droid builds next.",
  "Each feature lives in its own file, so Droids can build in parallel.",
  "Droids read AGENTS.md before they touch a line of code.",
  "Lint, types, unit tests, and browser tests run before every merge.",
  "Droid pull requests pass the same CI checks as human ones.",
] as const;

const ROTATE_MS = 8000;

// Sizes follow the 16:9 wall stage, which is limited by whichever viewport
// axis is smaller, so the type stays legible from across the booth floor.
const factSize = "clamp(0.8rem, min(1.3vw, 2.3vh), 2.6rem)";
const labelSize = "clamp(0.45rem, min(0.62vw, 1.1vh), 1.2rem)";

const styles = `
.booth-droid-fact {
  animation: booth-droid-fact-in 600ms ease-out both;
}

.booth-droid-fact-progress {
  transform-origin: left center;
  animation: booth-droid-fact-progress ${ROTATE_MS}ms linear both;
}

@keyframes booth-droid-fact-in {
  from { opacity: 0; transform: translateY(0.4em); }
  to { opacity: 1; transform: none; }
}

@keyframes booth-droid-fact-progress {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

@media (prefers-reduced-motion: reduce) {
  .booth-droid-fact,
  .booth-droid-fact-progress {
    animation: none;
  }
}
`;

export function DroidFacts() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setIndex((current) => (current + 1) % FACTS.length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      role="region"
      aria-label="Droid facts"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "0.6em",
        padding: "7% 8%",
        border: "1px solid #262626",
        background: "#0d0d0d",
        color: "#f2efe7",
        overflow: "hidden",
      }}
    >
      <style>{styles}</style>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: labelSize,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#ff6a3d",
        }}
      >
        <p style={{ margin: 0 }}>Droid fact</p>
        <p style={{ margin: 0, color: "#9d9a94", fontVariantNumeric: "tabular-nums" }}>
          {String(index + 1).padStart(2, "0")}/{String(FACTS.length).padStart(2, "0")}
        </p>
      </div>
      <div aria-live="polite">
        <p
          key={index}
          className="booth-droid-fact"
          style={{
            margin: 0,
            fontSize: factSize,
            fontWeight: 600,
            lineHeight: 1.18,
            letterSpacing: "-0.01em",
            textWrap: "balance",
          }}
        >
          {FACTS[index]}
        </p>
      </div>
      <div aria-hidden="true" style={{ height: "0.25em", minHeight: 2, background: "#262626" }}>
        <div
          key={index}
          className="booth-droid-fact-progress"
          style={{ height: "100%", background: "#ff4b24" }}
        />
      </div>
    </div>
  );
}
