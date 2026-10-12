"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

const MAX_ENERGY = 100;
const DECAY_PER_SECOND = 5;
const TICK_MS = 250;
const SEGMENTS = 10;

// Token bucket: a burst of BURST reactions, then one more every REFILL_MS.
// MIN_GAP_MS also drops key auto-repeat and double taps that land too close
// together, so holding a key cannot pin the gauge at full.
const BURST = 5;
const REFILL_MS = 1500;
const MIN_GAP_MS = 200;

type ReactionKey = "clap" | "wow" | "love" | "ship";

type Reaction = {
  key: ReactionKey;
  label: string;
  shortcut: string;
  boost: number;
};

const reactions: Reaction[] = [
  { key: "clap", label: "Clap", shortcut: "1", boost: 8 },
  { key: "wow", label: "Wow", shortcut: "2", boost: 12 },
  { key: "love", label: "Love", shortcut: "3", boost: 10 },
  { key: "ship", label: "Ship it", shortcut: "4", boost: 15 },
];

type Level = { name: string; min: number; color: string };

const levels: Level[] = [
  { name: "Electric", min: 75, color: "#ff4b24" },
  { name: "Buzzing", min: 50, color: "#ff6a3d" },
  { name: "Warm", min: 25, color: "#ffb627" },
  { name: "Calm", min: 0, color: "#9d9a94" },
];

const levelFor = (energy: number) => levels.find((level) => energy >= level.min) ?? levels[levels.length - 1];

type Bucket = { tokens: number; refilledAt: number; lastReactionAt: number };

function refill(bucket: Bucket, now: number): Bucket {
  const gained = (now - bucket.refilledAt) / REFILL_MS;
  return { ...bucket, tokens: Math.min(BURST, bucket.tokens + gained), refilledAt: now };
}

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
const labelSize = "clamp(0.45rem, min(0.62vw, 1.1vh), 1.2rem)";
const valueSize = "clamp(0.8rem, min(1.5vw, 2.7vh), 3rem)";
const buttonSize = "clamp(0.45rem, min(0.64vw, 1.14vh), 1.25rem)";
const noteSize = "clamp(0.45rem, min(0.62vw, 1.1vh), 1.2rem)";

// The wall grid styles `.feature-cell > div`, `strong`, and `span`, so layout
// is pinned inline, those elements are avoided, and focus and motion rules
// live in a scoped style tag to keep the feature in one file.
const styles = `
.booth-reaction-button {
  min-width: 0;
  padding: 0.45em 0.2em;
  border: 1px solid #343434;
  border-radius: 2px;
  background: #151515;
  color: #f2efe7;
  font-family: ${mono};
  font-size: ${buttonSize};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease;
}

.booth-reaction-button:hover {
  border-color: #ff6a3d;
}

.booth-reaction-button:focus-visible {
  outline: 2px solid #ffb627;
  outline-offset: 1px;
}

.booth-reaction-button[aria-disabled="true"] {
  border-color: #262626;
  background: #0d0d0d;
  color: #6e6e6e;
  cursor: not-allowed;
}

.booth-reaction-fill {
  transition: background 200ms ease;
}

.booth-reaction-pop {
  animation: booth-reaction-pop 420ms steps(6, end) both;
}

@keyframes booth-reaction-pop {
  0% { transform: scale(1.18); }
  100% { transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .booth-reaction-button,
  .booth-reaction-fill {
    transition: none;
  }
  .booth-reaction-pop {
    animation: none;
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

export function ReactionMeter() {
  const [energy, setEnergy] = useState(0);
  const [tokens, setTokens] = useState(BURST);
  const [total, setTotal] = useState(0);
  const [last, setLast] = useState<{ key: ReactionKey; id: number } | null>(null);
  const bucket = useRef<Bucket | null>(null);

  const idle = energy <= 0 && tokens >= BURST;

  useEffect(() => {
    if (idle) return;
    const timer = window.setInterval(() => {
      setEnergy((current) => Math.max(0, current - (DECAY_PER_SECOND * TICK_MS) / 1000));
      if (bucket.current) {
        bucket.current = refill(bucket.current, performance.now());
        setTokens(bucket.current.tokens);
      }
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [idle]);

  // Event timestamps share performance.now()'s time origin, so they line up
  // with the refill ticks.
  const react = (reaction: Reaction, now: number) => {
    const current = refill(
      bucket.current ?? { tokens: BURST, refilledAt: now, lastReactionAt: -Infinity },
      now,
    );
    if (current.tokens < 1 || now - current.lastReactionAt < MIN_GAP_MS) {
      bucket.current = current;
      setTokens(current.tokens);
      return;
    }
    bucket.current = { ...current, tokens: current.tokens - 1, lastReactionAt: now };
    setTokens(bucket.current.tokens);
    setEnergy((value) => Math.min(MAX_ENERGY, value + reaction.boost));
    setTotal((count) => count + 1);
    setLast((previous) => ({ key: reaction.key, id: (previous?.id ?? 0) + 1 }));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const reaction = reactions.find((entry) => entry.shortcut === event.key);
    if (!reaction) return;
    event.preventDefault();
    react(reaction, event.timeStamp);
  };

  const rounded = Math.round(energy);
  const level = levelFor(energy);
  const limited = tokens < 1;
  const readyIn = Math.max(1, Math.ceil(((1 - tokens) * REFILL_MS) / 1000));
  const filled = Math.ceil((energy / MAX_ENERGY) * SEGMENTS);
  const lastLabel = last ? reactions.find((entry) => entry.key === last.key)?.label : null;

  const status = limited
    ? `Cooling down, ready in ${readyIn}s`
    : total === 0
      ? "Press 1 to 4 or tap to react"
      : `${total} ${total === 1 ? "reaction" : "reactions"}, last ${lastLabel}`;

  return (
    <div
      role="region"
      aria-label="Reaction meter"
      data-reaction-level={level.name.toLowerCase()}
      data-rate-limited={limited ? "true" : "false"}
      onKeyDown={onKeyDown}
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "0.35em",
        padding: "6% 7%",
        border: `1px solid ${energy >= 75 ? "#ff4b24" : "#262626"}`,
        background: "#0d0d0d",
        color: "#f2efe7",
        overflow: "hidden",
      }}
    >
      <style>{styles}</style>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.5em", padding: 0 }}>
        <p style={label}>Reaction meter</p>
        <p style={{ ...label, color: level.color }}>{level.name}</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5em", minWidth: 0, padding: 0 }}>
        <div
          role="meter"
          aria-label="Crowd energy"
          aria-valuemin={0}
          aria-valuemax={MAX_ENERGY}
          aria-valuenow={rounded}
          aria-valuetext={`${rounded} of ${MAX_ENERGY}, ${level.name}`}
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: `repeat(${SEGMENTS}, 1fr)`,
            gap: "0.18em",
            height: "clamp(0.4rem, min(0.9vw, 1.6vh), 1.8rem)",
            padding: 0,
          }}
        >
          {Array.from({ length: SEGMENTS }, (_, index) => (
            <i
              key={index}
              aria-hidden="true"
              className="booth-reaction-fill"
              style={{
                display: "block",
                borderRadius: "1px",
                background: index < filled ? levelFor(((index + 1) / SEGMENTS) * MAX_ENERGY).color : "#1f1f1f",
              }}
            />
          ))}
        </div>
        <p
          key={last?.id ?? "idle"}
          aria-hidden="true"
          className={last ? "booth-reaction-pop" : undefined}
          style={{
            margin: 0,
            minWidth: "2ch",
            textAlign: "right",
            fontSize: valueSize,
            fontWeight: 600,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {String(rounded).padStart(2, "0")}
        </p>
      </div>
      <div
        role="group"
        aria-label="Send a reaction"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${reactions.length}, minmax(0, 1fr))`,
          gap: "0.3em",
          padding: 0,
        }}
      >
        {reactions.map((reaction) => (
          <button
            key={reaction.key}
            type="button"
            className="booth-reaction-button"
            aria-disabled={limited}
            aria-keyshortcuts={reaction.shortcut}
            aria-label={`${reaction.label}, shortcut ${reaction.shortcut}`}
            data-reaction={reaction.key}
            onClick={(event) => react(reaction, event.timeStamp)}
          >
            {reaction.label}
          </button>
        ))}
      </div>
      <p aria-live="polite" style={{ ...note, color: limited ? "#ffb627" : note.color }}>
        {status}
      </p>
    </div>
  );
}
