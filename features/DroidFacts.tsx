"use client";

import { useEffect, useState } from "react";

type DroidFact = {
  text: string;
  source?: string;
};

const FACTS: readonly DroidFact[] = [
  { text: "Droids pick up Linear tickets and turn them into pull requests." },
  { text: "Every panel on this wall is built by a Droid, one ticket at a time." },
  { text: "Visitors vote on which ticket a Droid builds next." },
  { text: "Each feature lives in its own file, so Droids can build in parallel." },
  { text: "Droids read AGENTS.md before they touch a line of code." },
  { text: "Lint, types, unit tests, and browser tests run before every merge." },
  { text: "Droid pull requests pass the same CI checks as human ones." },
  { text: "7x faster feature delivery", source: "factory.com/enterprise" },
  { text: "96.1% less time spent on migrations", source: "factory.com/enterprise" },
  { text: "95.8% of on-call resolution time saved", source: "factory.com/enterprise" },
];

const ROTATE_MS = 8000;
const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

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

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function DroidFacts() {
  const [index, setIndex] = useState(0);
  const fact = FACTS[index];

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
          fontFamily: mono,
          fontSize: labelSize,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#ff6a3d",
        }}
      >
        <p style={{ margin: 0 }}>Droid fact</p>
        <p style={{ margin: 0, color: "#9d9a94", fontVariantNumeric: "tabular-nums" }}>
          {pad(index + 1)}/{pad(FACTS.length)}
        </p>
      </div>
      <div aria-live="polite" style={{ minHeight: 0 }}>
        <div key={index} className="booth-droid-fact">
          <p
            style={{
              margin: 0,
              fontSize: factSize,
              fontWeight: 600,
              lineHeight: 1.18,
              letterSpacing: "-0.01em",
              textWrap: "balance",
            }}
          >
            {fact.text}
          </p>
          {fact.source ? (
            <p
              style={{
                margin: "0.7em 0 0",
                fontFamily: mono,
                fontSize: labelSize,
                letterSpacing: "0.08em",
                color: "#9d9a94",
              }}
            >
              Source: {fact.source}
            </p>
          ) : null}
        </div>
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
