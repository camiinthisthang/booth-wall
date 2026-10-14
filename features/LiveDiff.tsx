"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveDiffData, LiveDiffLine } from "@/lib/live-diff";

const POLL_MS = 10_000;
const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

type ApiResponse =
  | ({ configured: true } & LiveDiffData)
  | { configured: false; message: string };

const lineColor: Record<LiveDiffLine["kind"], string> = {
  addition: "#8ff0a4",
  deletion: "#ff8f82",
  header: "#ffb627",
  context: "#b8b5ae",
  notice: "#9d9a94",
};

export function LiveDiff() {
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const previousPull = useRef<number | null>(null);

  useEffect(() => {
    let controller: AbortController | null = null;
    const poll = async () => {
      if (document.hidden) return;
      controller?.abort();
      controller = new AbortController();
      try {
        const request = await fetch("/api/live-diff", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!request.ok) return;
        const next = (await request.json()) as ApiResponse;
        if (
          next.configured &&
          next.pull &&
          previousPull.current !== next.pull.number
        ) {
          previousPull.current = next.pull.number;
          scroller.current?.scrollTo({ top: 0 });
        }
        setResponse(next);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // Preserve the latest real diff through transient failures.
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

  useEffect(() => {
    const viewport = scroller.current;
    if (
      !viewport ||
      !response?.configured ||
      !response.pull ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    let frame = 0;
    let previous = performance.now();
    const scroll = (time: number) => {
      const elapsed = Math.min(100, time - previous);
      previous = time;
      const limit = viewport.scrollHeight - viewport.clientHeight;
      if (limit > 0) {
        viewport.scrollTop =
          viewport.scrollTop >= limit
            ? 0
            : viewport.scrollTop + elapsed * 0.004;
      }
      frame = window.requestAnimationFrame(scroll);
    };
    frame = window.requestAnimationFrame(scroll);
    return () => window.cancelAnimationFrame(frame);
  }, [response]);

  const pull = response?.configured ? response.pull : null;

  return (
    <div
      role="region"
      aria-label="Live Diff"
      style={{
        height: "100%",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: "0.45em",
        padding: "6% 7%",
        border: `1px solid ${pull ? "#ff4b24" : "#262626"}`,
        background: "#0d0d0d",
        color: "#f2efe7",
        overflow: "hidden",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontFamily: mono,
            fontSize: "clamp(0.46rem, min(0.64vw, 1.12vh), 1.2rem)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#ff6a3d",
          }}
        >
          Live Diff
        </p>
        {pull ? (
          <p
            style={{
              margin: "0.25em 0 0",
              fontFamily: mono,
              fontSize: "clamp(0.45rem, min(0.64vw, 1.12vh), 1.2rem)",
              lineHeight: 1,
              color: "#f2efe7",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            #{pull.number} · {pull.ticketId ?? "No ticket ID"} ·{" "}
            {pull.filesChanged} files
          </p>
        ) : null}
      </div>
      <div
        ref={scroller}
        aria-live="polite"
        style={{
          minHeight: 0,
          overflow: "hidden",
          fontFamily: mono,
          fontSize: "clamp(0.48rem, min(0.68vw, 1.18vh), 1.25rem)",
          lineHeight: 1.45,
          fontVariantLigatures: "none",
        }}
      >
        {pull ? (
          pull.lines.map((line, index) => (
            <code
              key={`${index}:${line.text}`}
              style={{
                display: "block",
                minHeight: "1.45em",
                color: lineColor[line.kind],
                whiteSpace: "pre",
              }}
            >
              {line.text || " "}
            </code>
          ))
        ) : (
          <p
            style={{
              margin: 0,
              color: "#9d9a94",
              lineHeight: 1.35,
            }}
          >
            {response === null
              ? "Reading the latest pull request"
              : response.configured
                ? "No pull request diff is available"
                : response.message}
          </p>
        )}
      </div>
    </div>
  );
}
