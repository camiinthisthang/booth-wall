"use client";

import { useSyncExternalStore } from "react";

// Time and zone exist only in the visitor's browser. The server snapshot is
// null, so the server HTML and the hydration render match exactly and the live
// time appears on the first client render after hydration.
let now: number | null = null;
let timer: number | undefined;
const listeners = new Set<() => void>();

function currentSecond() {
  return Math.floor(Date.now() / 1000) * 1000;
}

function tick() {
  now = currentSecond();
  for (const listener of listeners) listener();
  // Re-align to each second boundary so the display never drifts or skips.
  timer = window.setTimeout(tick, 1000 - (Date.now() % 1000));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) tick();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.clearTimeout(timer);
      timer = undefined;
    }
  };
}

function getSnapshot() {
  if (now === null) now = currentSecond();
  return now;
}

function getServerSnapshot() {
  return null;
}

interface Formatters {
  time: Intl.DateTimeFormat;
  date: Intl.DateTimeFormat;
  zone: Intl.DateTimeFormat;
  city: string;
}

let formatters: Formatters | null = null;

function getFormatters(): Formatters {
  if (formatters) return formatters;
  const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const city = timeZone.split("/").pop()?.replace(/_/g, " ") || timeZone;
  formatters = {
    time: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }),
    date: new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }),
    zone: new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }),
    city,
  };
  return formatters;
}

function readClock(timestamp: number) {
  const { time, date, zone, city } = getFormatters();
  const value = new Date(timestamp);
  const parts = time.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  const zoneName = zone.formatToParts(value).find((entry) => entry.type === "timeZoneName")?.value ?? "";
  return {
    hoursMinutes: `${part("hour")}:${part("minute")}`,
    seconds: part("second"),
    dayPeriod: part("dayPeriod"),
    date: date.format(value),
    zone: zoneName,
    city: city === zoneName ? "" : city,
    iso: value.toISOString(),
  };
}

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

// Sizes follow the 16:9 wall stage, which is limited by whichever viewport
// axis is smaller, so the clock stays legible from across the booth floor.
const timeSize = "clamp(1rem, min(2.5vw, 4.4vh), 5rem)";
const secondsSize = "clamp(0.5rem, min(1vw, 1.8vh), 2rem)";
const labelSize = "clamp(0.45rem, min(0.62vw, 1.1vh), 1.2rem)";

// `.feature-cell span` in the global styles shrinks and uppercases spans, so
// every span here resets the properties it inherits from that rule.
const spanReset = { fontFamily: "inherit", fontSize: "inherit", textTransform: "none", letterSpacing: "inherit" } as const;

export function VisitorClock() {
  const timestamp = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const clock = timestamp === null ? null : readClock(timestamp);
  const spoken = clock
    ? `${clock.hoursMinutes} ${clock.dayPeriod} ${clock.zone}`.replace(/\s+/g, " ").trim()
    : "Local time loading";

  return (
    <div
      role="region"
      aria-label="Visitor clock"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "0.4em",
        padding: "7% 8%",
        border: "1px solid #262626",
        background: "#0d0d0d",
        color: "#f2efe7",
        boxShadow: "none",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "0.6em",
          fontFamily: mono,
          fontSize: labelSize,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        <p style={{ margin: 0, color: "#ff6a3d", whiteSpace: "nowrap" }}>Your time</p>
        <p
          style={{
            margin: 0,
            color: "#9d9a94",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {clock?.date ?? "\u00a0"}
        </p>
      </div>
      <time
        dateTime={clock?.iso}
        aria-label={spoken}
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.15em",
          fontSize: timeSize,
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          color: "#f2efe7",
        }}
      >
        <span style={{ ...spanReset, color: "inherit" }}>{clock?.hoursMinutes ?? "--:--"}</span>
        <span
          aria-hidden="true"
          style={{
            ...spanReset,
            fontFamily: mono,
            fontSize: secondsSize,
            fontWeight: 400,
            letterSpacing: "0.04em",
            color: "#9d9a94",
          }}
        >
          {clock ? clock.seconds : "--"}
          {clock?.dayPeriod ? ` ${clock.dayPeriod}` : ""}
        </span>
      </time>
      <p
        title={clock?.city || clock?.zone}
        style={{
          margin: 0,
          fontFamily: mono,
          fontSize: labelSize,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#9d9a94",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        <span style={{ ...spanReset, textTransform: "uppercase", color: "#f2efe7" }}>{clock?.zone || "Local"}</span>
        {clock ? (clock.city ? ` ${clock.city}` : "") : " zone"}
      </p>
    </div>
  );
}
