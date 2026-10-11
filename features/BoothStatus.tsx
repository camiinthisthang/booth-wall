"use client";

import { useEffect, useState } from "react";

const POLL_MS = 30000;

type Health = "checking" | "online" | "offline" | "unreachable";

type SystemKey = "linear" | "github" | "voting";

type Probe = {
  key: SystemKey;
  name: string;
  endpoint: string;
  offlineCopy: string;
};

// Only public, read-only routes are probed. The component reads nothing but
// the HTTP status and the `configured` flag, and every visible word comes from
// this file, so no server message, token, or URL can reach the wall.
const probes: Probe[] = [
  { key: "linear", name: "Linear", endpoint: "/api/board", offlineCopy: "Not connected" },
  { key: "github", name: "GitHub", endpoint: "/api/github/summary", offlineCopy: "Not connected" },
  { key: "voting", name: "Voting", endpoint: "/api/issues", offlineCopy: "Not open yet" },
];

const healthCopy: Record<Exclude<Health, "offline">, string> = {
  checking: "Checking",
  online: "Online",
  unreachable: "Unreachable",
};

const healthColor: Record<Health, string> = {
  checking: "#6e6e6e",
  online: "#3ddc84",
  offline: "#9d9a94",
  unreachable: "#ff4b24",
};

type Statuses = Record<SystemKey, Health>;

const initial: Statuses = { linear: "checking", github: "checking", voting: "checking" };

async function readHealth(endpoint: string, signal: AbortSignal): Promise<Health> {
  const response = await fetch(endpoint, { signal, cache: "no-store" });
  if (!response.ok) return "unreachable";
  const body: unknown = await response.json();
  if (!body || typeof body !== "object") return "unreachable";
  return (body as { configured?: unknown }).configured === true ? "online" : "offline";
}

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
const labelSize = "clamp(0.45rem, min(0.62vw, 1.1vh), 1.2rem)";
const rowSize = "clamp(0.55rem, min(0.9vw, 1.6vh), 1.8rem)";
const noteSize = "clamp(0.5rem, min(0.72vw, 1.28vh), 1.4rem)";

// The wall grid styles `.feature-cell > div`, `strong`, and `span`, so layout
// is pinned inline and only p/div/ul/li are used.
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

const row = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.6em",
  minWidth: 0,
  fontSize: rowSize,
  lineHeight: 1.2,
} as const;

function StatusRow({ probe, health }: { probe: Probe; health: Health }) {
  const copy = health === "offline" ? probe.offlineCopy : healthCopy[health];
  return (
    <li style={row} data-system={probe.key} data-health={health}>
      <p style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5em", color: "#f2efe7" }}>
        <em
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: "0.55em",
            height: "0.55em",
            borderRadius: "50%",
            background: healthColor[health],
            boxShadow: health === "online" ? `0 0 0.5em ${healthColor.online}` : "none",
          }}
        />
        {probe.name}
      </p>
      <p
        style={{
          margin: 0,
          fontFamily: mono,
          fontSize: noteSize,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: healthColor[health],
          whiteSpace: "nowrap",
        }}
      >
        {copy}
      </p>
    </li>
  );
}

export function BoothStatus() {
  const [statuses, setStatuses] = useState<Statuses>(initial);

  useEffect(() => {
    let controller: AbortController | null = null;

    const poll = async () => {
      if (document.hidden) return;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      const results = await Promise.all(
        probes.map(async (probe) => {
          try {
            return [probe.key, await readHealth(probe.endpoint, current.signal)] as const;
          } catch {
            return [probe.key, current.signal.aborted ? null : ("unreachable" as Health)] as const;
          }
        }),
      );
      if (current.signal.aborted) return;
      setStatuses((previous) => {
        const next = { ...previous };
        for (const [key, health] of results) if (health) next[key] = health;
        return next;
      });
    };

    void poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      window.clearInterval(timer);
      controller?.abort();
    };
  }, []);

  const healths = probes.map((probe) => statuses[probe.key]);
  const online = healths.filter((health) => health === "online").length;
  const checking = healths.includes("checking");
  const allOnline = online === probes.length;

  return (
    <div
      role="region"
      aria-label="Booth status"
      data-booth-status={checking ? "checking" : allOnline ? "online" : "partial"}
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "0.4em",
        padding: "6% 7%",
        border: `1px solid ${allOnline ? "#1f3a2a" : "#262626"}`,
        background: "#0d0d0d",
        color: "#f2efe7",
        overflow: "hidden",
      }}
    >
      <p style={label}>Booth status</p>
      <ul
        aria-live="polite"
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "0.45em",
          minWidth: 0,
        }}
      >
        {probes.map((probe) => (
          <StatusRow key={probe.key} probe={probe} health={statuses[probe.key]} />
        ))}
      </ul>
      <p style={note}>
        {checking ? "Running system checks" : `${online} of ${probes.length} systems online`}
      </p>
    </div>
  );
}
