"use client";

import { useEffect, useState } from "react";
import type { TicketToLiveMetrics } from "@/lib/ticket-to-live";

const POLL_MS = 15_000;
const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

type ApiResponse =
  | ({ configured: true } & TicketToLiveMetrics)
  | { configured: false; message: string };

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function TicketToLive() {
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let controller: AbortController | null = null;
    const poll = async () => {
      if (document.hidden) return;
      controller?.abort();
      controller = new AbortController();
      try {
        const request = await fetch("/api/ticket-to-live", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!request.ok) return;
        setResponse((await request.json()) as ApiResponse);
        setNow(Date.now());
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // Keep the last real measurement visible through transient failures.
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

  const current = response?.configured ? response.current : null;
  const running = current?.completedAt === null;

  useEffect(() => {
    if (
      !running ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const elapsed = current
    ? current.durationMs ??
      Math.max(0, now - new Date(current.startedAt).getTime())
    : null;
  const available = response?.configured === true;

  return (
    <div
      role="region"
      aria-label="Ticket to Live"
      style={{
        height: "100%",
        padding: 0,
        border: `1px solid ${current ? "#ff4b24" : "#262626"}`,
        background: "#0d0d0d",
        color: "#f2efe7",
        overflow: "hidden",
        containerType: "size",
      }}
    >
      <div
        style={{
          height: "100%",
          display: "grid",
          gridTemplateRows: "auto 1fr auto",
          gap: "0.45em",
          padding: "5cqh 5.5cqw",
          overflow: "hidden",
        }}
      >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "1em",
          minWidth: 0,
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: mono,
            fontSize: "clamp(0.48rem, min(0.68vw, 1.18vh), 1.25rem)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#ff6a3d",
          }}
        >
          Ticket to Live
        </p>
        {current ? (
          <p
            style={{
              margin: 0,
              fontFamily: mono,
              fontSize: "clamp(0.5rem, min(0.76vw, 1.3vh), 1.4rem)",
              color: "#9d9a94",
              whiteSpace: "nowrap",
            }}
          >
            {current.identifier}
          </p>
        ) : null}
      </div>

      <div
        aria-live="polite"
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          minHeight: 0,
        }}
      >
        {current && elapsed !== null ? (
          <>
            <p
              style={{
                margin: 0,
                fontFamily: mono,
                fontSize: "clamp(1.2rem, 30cqh, 6rem)",
                fontWeight: 700,
                lineHeight: 0.95,
                letterSpacing: "-0.055em",
                color: "#f2efe7",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {formatDuration(elapsed)}
            </p>
            <p
              style={{
                margin: "0.35em 0 0",
                fontSize: "clamp(0.55rem, 8cqh, 1.8rem)",
                lineHeight: 1.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {current.completedAt ? "Ticket to live" : current.title}
            </p>
          </>
        ) : (
          <p
            style={{
              margin: 0,
              fontFamily: mono,
              fontSize: "clamp(0.65rem, min(1.05vw, 1.9vh), 2rem)",
              lineHeight: 1.3,
              color: "#9d9a94",
            }}
          >
            {response === null
              ? "Reading the build clock"
              : available
                ? "No ticket is moving to production"
                : response.message}
          </p>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.7em",
          borderTop: "1px solid #262626",
          paddingTop: "0.55em",
        }}
      >
        <Statistic
          label="Fastest today"
          value={
            available && response.fastestMs !== null
              ? formatDuration(response.fastestMs)
              : "No finish yet"
          }
        />
        <Statistic
          label="Median today"
          value={
            available && response.medianMs !== null
              ? formatDuration(response.medianMs)
              : "No finish yet"
          }
        />
      </div>
      </div>
    </div>
  );
}

function Statistic({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p
        style={{
          margin: 0,
          fontFamily: mono,
          fontSize: "clamp(0.4rem, min(0.58vw, 1vh), 1rem)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#9d9a94",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "0.12em 0 0",
          fontFamily: mono,
          fontSize: "clamp(0.65rem, min(1.15vw, 2vh), 2.1rem)",
          color: "#ffb627",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </p>
    </div>
  );
}
