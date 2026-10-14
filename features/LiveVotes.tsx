"use client";

import { useEffect, useState } from "react";
import { formatVoteEvent, type VoteEvent } from "@/lib/vote-events";

const POLL_MS = 5_000;
const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

type VoteEventsResponse = {
  events: VoteEvent[];
  totalToday: number;
  serverTime: string;
};

const styles = `
.booth-live-vote {
  animation: booth-live-vote-in 420ms steps(6, end) both;
}

@keyframes booth-live-vote-in {
  from { opacity: 0; transform: translateY(-0.75em); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .booth-live-vote {
    animation: none;
  }
}
`;

export function LiveVotes() {
  const [data, setData] = useState<VoteEventsResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let controller: AbortController | null = null;
    const poll = async () => {
      if (document.hidden) return;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/vote-events", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const next = (await response.json()) as VoteEventsResponse;
        if (!Array.isArray(next.events)) return;
        setData(next);
        setNow(new Date(next.serverTime).getTime());
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // Preserve the latest real feed during a transient failure.
        }
      }
    };
    void poll();
    const pollTimer = window.setInterval(poll, POLL_MS);
    const clockTimer = window.setInterval(
      () => setNow((current) => current + 1_000),
      1_000,
    );
    return () => {
      controller?.abort();
      window.clearInterval(pollTimer);
      window.clearInterval(clockTimer);
    };
  }, []);

  return (
    <div
      role="region"
      aria-label="Live Votes"
      style={{
        height: "100%",
        display: "grid",
        gridTemplateRows: "auto auto 1fr",
        gap: "0.42em",
        padding: "7% 8%",
        border: `1px solid ${data?.events.length ? "#ff4b24" : "#262626"}`,
        background: "#0d0d0d",
        color: "#f2efe7",
        overflow: "hidden",
      }}
    >
      <style>{styles}</style>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "0.5em",
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
          Live Votes
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: mono,
            fontSize: "clamp(0.5rem, min(0.72vw, 1.28vh), 1.35rem)",
            color: "#ffb627",
            whiteSpace: "nowrap",
          }}
        >
          {data?.totalToday ?? 0} VOTES TODAY
        </p>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: "clamp(0.68rem, min(1.05vw, 1.85vh), 2rem)",
          fontWeight: 650,
          lineHeight: 1,
        }}
      >
        The crowd picks the build.
      </p>
      <div
        aria-live="polite"
        style={{
          minHeight: 0,
          overflow: "hidden",
          fontFamily: mono,
          fontSize: "clamp(0.42rem, min(0.58vw, 1.02vh), 1.1rem)",
          lineHeight: 1.35,
          color: "#b8b5ae",
        }}
      >
        {data?.events.length ? (
          data.events.slice(0, 2).map((event) => (
            <p
              className="booth-live-vote"
              key={event.id}
              style={{
                margin: "0 0 0.28em",
                color: event.type === "promotion" ? "#ffb627" : "#b8b5ae",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {formatVoteEvent(event, now)}
            </p>
          ))
        ) : (
          <p style={{ margin: 0 }}>
            {data === null ? "Loading live votes." : "Scan the QR code to vote."}
          </p>
        )}
      </div>
    </div>
  );
}
