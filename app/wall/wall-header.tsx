"use client";

import { useEffect, useState } from "react";
import type { GitHubSummary } from "@/lib/github";

const fallback: GitHubSummary = {
  configured: false,
  mergedToday: 0,
  latest: null,
};

export function WallHeader() {
  const [summary, setSummary] = useState(fallback);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/github/summary", { signal: controller.signal })
      .then((response) => response.json())
      .then((value: GitHubSummary) => setSummary(value))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <header className="wall-header">
      <div className="factory-mark" aria-label="Factory">
        <span aria-hidden="true">F</span>
        FACTORY
      </div>
      <div className="wall-title">
        <h1><span>THE BOOTH THAT</span>BUILDS ITSELF</h1>
      </div>
      <div className="ship-metrics">
        <div>
          <strong>{summary.mergedToday.toString().padStart(2, "0")}</strong>
          <span>PRs merged today</span>
        </div>
        <p>
          <span className="signal-dot" />
          {summary.latest ? (
            <a href={summary.latest.url}>
              Latest: #{summary.latest.number} {summary.latest.title}
            </a>
          ) : summary.configured ? (
            "Waiting for the next ship"
          ) : (
            "Connect GitHub for live ships"
          )}
        </p>
      </div>
    </header>
  );
}
