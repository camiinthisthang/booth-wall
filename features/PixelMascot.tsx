"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { GitHubSummary, TicketPullRequest } from "@/lib/github";
import type { BoothIssue } from "@/lib/linear";

const POLL_MS = 10_000;
const STATIONS = [
  "Backlog",
  "Todo",
  "In Progress",
  "PR Open",
  "Checks",
  "Merged",
  "Live",
] as const;

type FactoryFloorStation = (typeof STATIONS)[number];
type FloorEvent = { text: string; timestamp: string };
type FloorSnapshot = {
  issues: BoothIssue[];
  pulls: TicketPullRequest[];
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => {
    finished: Promise<void>;
  };
};

export function stationForTicket(
  issue: BoothIssue,
  pull?: TicketPullRequest,
): FactoryFloorStation {
  if (pull?.state === "merged") {
    return issue.state === "Done" ? "Live" : "Merged";
  }
  if (pull?.state === "open" && pull.checks !== "none") return "Checks";
  if (pull?.state === "open" || issue.state === "In Review") return "PR Open";
  if (issue.state === "Done") return "Live";
  if (issue.state === "In Progress") return "In Progress";
  if (issue.state === "Todo") return "Todo";
  return "Backlog";
}

export function buildFactoryFloorEvents(
  issues: BoothIssue[],
  pulls: TicketPullRequest[],
): FloorEvent[] {
  const issuesByIdentifier = new Map(
    issues.map((issue) => [issue.identifier.toUpperCase(), issue]),
  );
  const events: FloorEvent[] = [];

  for (const issue of issues) {
    if (
      issue.assignee ||
      ["In Progress", "In Review", "Done"].includes(issue.state)
    ) {
      events.push({
        text: `${issue.identifier} claimed`,
        timestamp: issue.updatedAt,
      });
    }
  }
  for (const pull of pulls) {
    if (!issuesByIdentifier.has(pull.identifier)) continue;
    events.push({
      text: `${pull.identifier} PR #${pull.number} opened`,
      timestamp: pull.createdAt,
    });
    if (pull.checks === "passed") {
      events.push({
        text: `${pull.identifier} checks passed`,
        timestamp: pull.updatedAt,
      });
    }
    if (pull.state === "merged" && pull.mergedAt) {
      events.push({
        text: `${pull.identifier} merged`,
        timestamp: pull.mergedAt,
      });
    }
  }

  return events
    .sort(
      (left, right) =>
        new Date(right.timestamp).getTime() -
        new Date(left.timestamp).getTime(),
    )
    .slice(0, 8);
}

function pullMap(pulls: TicketPullRequest[]) {
  const map = new Map<string, TicketPullRequest>();
  for (const pull of pulls) {
    if (!map.has(pull.identifier)) map.set(pull.identifier, pull);
  }
  return map;
}

function stationSignal(
  station: FactoryFloorStation,
  tickets: Array<{ pull?: TicketPullRequest }>,
) {
  if (station !== "Checks") return undefined;
  if (tickets.some(({ pull }) => pull?.checks === "failed")) return "failed";
  if (tickets.some(({ pull }) => pull?.checks === "passed")) return "passed";
  if (tickets.length > 0) return "pending";
  return undefined;
}

export function PixelMascot() {
  const [snapshot, setSnapshot] = useState<FloorSnapshot>({
    issues: [],
    pulls: [],
  });
  const [connected, setConnected] = useState(false);
  const inFlight = useRef(false);
  const hasSnapshot = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [boardResponse, githubResponse] = await Promise.all([
        fetch("/api/board", { cache: "no-store" }),
        fetch("/api/github/summary", { cache: "no-store" }),
      ]);
      if (!boardResponse.ok || !githubResponse.ok) throw new Error();
      const board = (await boardResponse.json()) as {
        configured: boolean;
        issues: BoothIssue[];
      };
      const github = (await githubResponse.json()) as GitHubSummary;
      const nextSnapshot = {
        issues: board.configured ? board.issues : [],
        pulls: github.configured ? github.ticketPullRequests : [],
      };
      const applySnapshot = () => {
        setSnapshot(nextSnapshot);
        setConnected(board.configured || github.configured);
        hasSnapshot.current = true;
      };
      const transitionDocument = document as ViewTransitionDocument;
      if (
        hasSnapshot.current &&
        transitionDocument.startViewTransition &&
        document.visibilityState === "visible" &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        transitionDocument
          .startViewTransition(applySnapshot)
          .finished.catch(() => undefined);
      } else {
        applySnapshot();
      }
    } catch {
      setConnected(false);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(refresh, 0);
    const interval = window.setInterval(refresh, POLL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const pulls = useMemo(() => pullMap(snapshot.pulls), [snapshot.pulls]);
  const stations = useMemo(
    () =>
      STATIONS.map((station) => ({
        station,
        tickets: snapshot.issues
          .map((issue) => ({
            issue,
            pull: pulls.get(issue.identifier.toUpperCase()),
          }))
          .filter(
            ({ issue, pull }) => stationForTicket(issue, pull) === station,
          ),
      })),
    [pulls, snapshot.issues],
  );
  const events = useMemo(
    () => buildFactoryFloorEvents(snapshot.issues, snapshot.pulls),
    [snapshot],
  );
  const ticker = events.length
    ? events
    : [{ text: connected ? "Factory floor is standing by" : "Connecting live floor", timestamp: "" }];

  return (
    <div className="factory-floor" data-connected={connected}>
      <header className="factory-floor-header">
        <strong>Factory Floor</strong>
        <span><i /> Live data from Linear and GitHub.</span>
      </header>
      <div className="factory-floor-track">
        <div className="factory-floor-idle" aria-hidden="true" />
        {stations.map(({ station, tickets }) => (
          <section
            className="factory-floor-station"
            data-signal={stationSignal(station, tickets)}
            key={station}
            aria-label={`${station}, ${tickets.length} tickets`}
          >
            <h2>{station}</h2>
            <div className="factory-floor-droids">
              {tickets.map(({ issue }) => (
                <div
                  className="factory-floor-droid"
                  key={issue.id}
                  style={{
                    viewTransitionName: `floor-${issue.identifier.toLowerCase()}`,
                  } as CSSProperties}
                >
                  <i className="factory-floor-antenna" aria-hidden="true" />
                  <i className="factory-floor-head" aria-hidden="true" />
                  <b>{issue.identifier}</b>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <section className="factory-floor-ticker" aria-label="Recent build events">
        <div>
          {[...ticker, ...ticker].map((event, index) => (
            <span key={`${event.text}-${index}`}>
              <i /> {event.text}
            </span>
          ))}
        </div>
      </section>
      <style>{factoryFloorStyles}</style>
    </div>
  );
}

const factoryFloorStyles = `
.factory-floor {
  position: relative;
  display: grid !important;
  grid-template-rows: auto 1fr auto;
  height: 100%;
  min-height: 0;
  padding: 0 !important;
  overflow: hidden;
  border: 1px solid #3b3b3b;
  background: #090909;
  color: #f3f0ea !important;
  box-shadow: inset 0 0 34px rgba(255, 74, 35, 0.04) !important;
}
.factory-floor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.28rem 0.55rem 0.22rem;
  border-bottom: 1px solid #303030;
}
.factory-floor-header strong {
  color: #f3f0ea;
  font-size: clamp(0.52rem, 0.72vw, 0.88rem);
  letter-spacing: 0.12em;
}
.factory-floor-header span {
  display: flex;
  align-items: center;
  gap: 0.38rem;
  color: #8a8a8a;
  font-size: clamp(0.34rem, 0.46vw, 0.58rem);
  letter-spacing: 0.08em;
}
.factory-floor-header span i {
  width: 0.34rem;
  height: 0.34rem;
  border-radius: 50%;
  background: #4cff82;
  box-shadow: 0 0 7px #4cff82;
}
.factory-floor[data-connected="false"] .factory-floor-header span i {
  background: #ff7a42;
  box-shadow: 0 0 7px #ff4b24;
}
.factory-floor-track {
  position: relative;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  min-height: 0;
  isolation: isolate;
}
.factory-floor-track::before {
  content: "";
  position: absolute;
  right: 0;
  bottom: 26%;
  left: 0;
  height: 1px;
  z-index: -1;
  background: linear-gradient(90deg, transparent, #744031 6%, #744031 94%, transparent);
  box-shadow: 0 0 8px rgba(255, 75, 36, 0.2);
}
.factory-floor-idle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 14%;
  z-index: -1;
  background: linear-gradient(90deg, transparent, rgba(255, 75, 36, 0.07), transparent);
  animation: factory-floor-scan 7s linear infinite;
}
.factory-floor-station {
  position: relative;
  min-width: 0;
  padding: 0.22rem 0.28rem;
  border-right: 1px solid #242424;
}
.factory-floor-station:last-child {
  border-right: 0;
}
.factory-floor-station h2 {
  margin: 0;
  color: #8d8984;
  font-size: clamp(0.34rem, 0.5vw, 0.64rem);
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}
.factory-floor-droids {
  display: flex;
  align-content: flex-end;
  align-items: flex-end;
  flex-wrap: wrap-reverse;
  gap: 0.16rem 0.24rem;
  height: calc(100% - 0.7rem);
  padding-top: 0.12rem;
  overflow: hidden;
}
.factory-floor-droid {
  position: relative;
  display: grid;
  grid-template-columns: 0.9rem auto;
  align-items: end;
  gap: 0.2rem;
  min-width: 0;
  animation: factory-floor-bob 2.4s ease-in-out infinite;
}
.factory-floor-droid:nth-child(2n) {
  animation-delay: -0.9s;
}
.factory-floor-droid:nth-child(3n) {
  animation-delay: -1.7s;
}
.factory-floor-head {
  position: relative;
  width: 0.9rem;
  height: 0.7rem;
  border: 1px solid #ff6943;
  background:
    linear-gradient(90deg, transparent 20%, #ff8b6f 20% 34%, transparent 34% 66%, #ff8b6f 66% 80%, transparent 80%),
    #24130f;
  box-shadow: 0 0 5px rgba(255, 75, 36, 0.28);
}
.factory-floor-antenna {
  position: absolute;
  top: -0.18rem;
  left: 0.42rem;
  width: 1px;
  height: 0.18rem;
  background: #ff6943;
}
.factory-floor-droid b {
  max-width: 4.3rem;
  overflow: hidden;
  color: #f3f0ea;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: clamp(0.4rem, 0.58vw, 0.72rem);
  line-height: 0.9;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.factory-floor-station[data-signal="passed"] {
  animation: factory-floor-pass 1.8s ease-in-out infinite;
}
.factory-floor-station[data-signal="failed"] {
  animation: factory-floor-fail 1.05s steps(2, end) infinite;
}
.factory-floor-station[data-signal="pending"] {
  background: rgba(255, 183, 77, 0.035);
}
.factory-floor-ticker {
  overflow: hidden;
  border-top: 1px solid #303030;
  background: #050505;
}
.factory-floor-ticker > div {
  display: flex;
  width: max-content;
  padding: 0.2rem 0;
  animation: factory-floor-ticker 32s linear infinite;
}
.factory-floor-ticker span {
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  padding-right: 2.2rem;
  color: #aaa7a1;
  font-size: clamp(0.3rem, 0.43vw, 0.54rem);
  letter-spacing: 0.09em;
  white-space: nowrap;
}
.factory-floor-ticker span i {
  width: 0.25rem;
  height: 0.25rem;
  background: #ff4b24;
  transform: rotate(45deg);
}
@keyframes factory-floor-scan {
  from { transform: translateX(-120%); }
  to { transform: translateX(720%); }
}
@keyframes factory-floor-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-0.12rem); }
}
@keyframes factory-floor-pass {
  0%, 100% { background: transparent; box-shadow: inset 0 0 0 rgba(76, 255, 130, 0); }
  50% { background: rgba(76, 255, 130, 0.11); box-shadow: inset 0 0 18px rgba(76, 255, 130, 0.12); }
}
@keyframes factory-floor-fail {
  0%, 100% { background: transparent; }
  50% { background: rgba(255, 58, 58, 0.16); }
}
@keyframes factory-floor-ticker {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .factory-floor-idle,
  .factory-floor-droid,
  .factory-floor-station,
  .factory-floor-ticker > div {
    animation: none !important;
  }
}
`;
