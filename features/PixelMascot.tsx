"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GitHubSummary, TicketPullRequest } from "@/lib/github";
import type { BoothIssue } from "@/lib/linear";

const POLL_MS = 10_000;
const MACHINES = [
  { id: "intake", label: "Intake Chute" },
  { id: "workbench", label: "Workbench" },
  { id: "test", label: "Test Chamber" },
  { id: "review", label: "Review Gate" },
  { id: "launch", label: "Launch Pad" },
] as const;

export type AssemblyMachine = (typeof MACHINES)[number]["id"];
type FloorEvent = { text: string; timestamp: string };
type FloorSnapshot = {
  issues: BoothIssue[];
  pulls: TicketPullRequest[];
};
type Actor = {
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  machine: AssemblyMachine;
  launchStarted?: number;
  issue: BoothIssue;
  pull?: TicketPullRequest;
};

const FEATURE_INDEX_BY_TICKET: Record<string, number> = {
  "BOOTH-1": 0,
  "BOOTH-2": 1,
  "BOOTH-3": 2,
  "BOOTH-4": 3,
  "BOOTH-5": 4,
  "BOOTH-7": 5,
  "BOOTH-6": 6,
  "BOOTH-8": 7,
  "BOOTH-9": 8,
  "BOOTH-10": 9,
  "BOOTH-11": 10,
  "BOOTH-12": 11,
};

export function featureIndexForTicket(identifier: string) {
  return FEATURE_INDEX_BY_TICKET[identifier.toUpperCase()];
}

export function machineForTicket(
  issue: BoothIssue,
  pull?: TicketPullRequest,
): AssemblyMachine {
  if (pull?.state === "merged" || issue.state === "Done") return "launch";
  if (pull?.state === "open") {
    if (pull.checks === "failed") return "workbench";
    if (pull.checks === "pending") return "test";
    return "review";
  }
  if (issue.state === "In Review") return "review";
  if (issue.state === "In Progress") return "workbench";
  return "intake";
}

export function detailForTicket(
  issue: BoothIssue,
  pull?: TicketPullRequest,
): string {
  const file = pull?.files[0]?.split("/").at(-1);
  if (file) return `Changing ${file}`;
  if (pull?.commits[0]) return pull.commits[0];
  if (pull?.checkNames[0]) return `Running ${pull.checkNames[0]}`;
  return issue.title;
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
    if (pull.checks === "failed") {
      events.push({
        text: `${pull.identifier} checks failed`,
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

function hash(value: string) {
  return [...value].reduce(
    (result, character) => (result * 31 + character.charCodeAt(0)) >>> 0,
    7,
  );
}

function pixelRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
) {
  context.fillStyle = fill;
  context.fillRect(
    Math.round(x),
    Math.round(y),
    Math.round(width),
    Math.round(height),
  );
}

function label(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color = "#f3f0ea",
  align: CanvasTextAlign = "left",
) {
  context.fillStyle = color;
  context.font = `700 ${Math.max(7, Math.round(size))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  context.textAlign = align;
  context.textBaseline = "middle";
  context.fillText(text.toUpperCase(), Math.round(x), Math.round(y));
}

function drawMachine(
  context: CanvasRenderingContext2D,
  machine: (typeof MACHINES)[number],
  x: number,
  width: number,
  top: number,
  beltY: number,
  time: number,
  status: TicketPullRequest["checks"] | "idle",
  reducedMotion: boolean,
) {
  const center = x + width / 2;
  const frameTop = top + 18;
  const frameHeight = beltY - frameTop - 10;
  label(context, machine.label, center, top + 6, width * 0.055, "#a9a39b", "center");

  if (machine.id === "intake") {
    pixelRect(context, center - width * 0.26, frameTop, width * 0.52, 8, "#4a3029");
    pixelRect(context, center - width * 0.19, frameTop + 8, width * 0.38, frameHeight * 0.62, "#211814");
    pixelRect(context, center - width * 0.12, frameTop + 18, width * 0.24, frameHeight * 0.45, "#050505");
    pixelRect(context, center - width * 0.2, beltY - 10, width * 0.4, 5, "#ff4b24");
  }

  if (machine.id === "workbench") {
    pixelRect(context, center - width * 0.34, beltY - 21, width * 0.68, 7, "#704332");
    pixelRect(context, center - width * 0.28, beltY - 14, 6, 14, "#31231d");
    pixelRect(context, center + width * 0.22, beltY - 14, 6, 14, "#31231d");
    const hammer = reducedMotion ? 0 : Math.sin(time / 130) * 7;
    context.strokeStyle = "#d9d1c7";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(center + 4, beltY - 39);
    context.lineTo(center + 12 + hammer, beltY - 23);
    context.stroke();
    pixelRect(context, center + 7 + hammer, beltY - 43, 14, 6, "#ff6943");
    for (let index = 0; index < 6; index += 1) {
      const phase = reducedMotion ? 0 : (time / 150 + index * 1.7) % 6;
      pixelRect(
        context,
        center + 10 + Math.cos(index * 2.3) * phase * 3,
        beltY - 20 - phase * 5,
        2,
        2,
        index % 2 ? "#ffd166" : "#ff4b24",
      );
    }
  }

  if (machine.id === "test") {
    pixelRect(context, center - width * 0.34, frameTop + 4, 7, frameHeight, "#3b3e42");
    pixelRect(context, center + width * 0.3, frameTop + 4, 7, frameHeight, "#3b3e42");
    pixelRect(context, center - width * 0.34, frameTop + 4, width * 0.68, 6, "#5c6268");
    const scanRange = frameHeight - 18;
    const scan = reducedMotion
      ? scanRange / 2
      : ((time / 7) % Math.max(1, scanRange));
    const scanColor = status === "failed" ? "#ff3d3d" : "#55ff88";
    pixelRect(context, center - width * 0.28, frameTop + 15 + scan, width * 0.56, 2, scanColor);
    context.fillStyle = `${scanColor}22`;
    context.fillRect(center - width * 0.28, frameTop + 15 + scan, width * 0.56, 11);
    pixelRect(context, center - 16, frameTop + 17, 32, 12, "#111");
    label(
      context,
      status === "failed" ? "FAIL" : status === "passed" ? "PASS" : "SCAN",
      center,
      frameTop + 23,
      8,
      scanColor,
      "center",
    );
  }

  if (machine.id === "review") {
    pixelRect(context, center - width * 0.31, frameTop + 4, 7, frameHeight, "#5b392d");
    pixelRect(context, center + width * 0.27, frameTop + 4, 7, frameHeight, "#5b392d");
    const gateOpen = status === "passed";
    const gateHeight = gateOpen ? frameHeight * 0.25 : frameHeight * 0.72;
    pixelRect(context, center - width * 0.23, frameTop + 9, width * 0.46, gateHeight, "#241915");
    for (let bar = 0; bar < 5; bar += 1) {
      pixelRect(
        context,
        center - width * 0.21 + bar * width * 0.1,
        frameTop + 10,
        2,
        gateHeight - 2,
        "#ff6943",
      );
    }
    pixelRect(context, center + width * 0.3, frameTop + 13, 9, 9, gateOpen ? "#55ff88" : "#ffb347");
  }

  if (machine.id === "launch") {
    pixelRect(context, center - width * 0.32, beltY - 13, width * 0.64, 7, "#73513c");
    pixelRect(context, center - width * 0.22, beltY - 25, width * 0.44, 12, "#281b16");
    const beamPulse = reducedMotion ? 0.45 : 0.25 + (Math.sin(time / 280) + 1) * 0.22;
    context.fillStyle = `rgba(255, 105, 67, ${beamPulse})`;
    context.fillRect(center - width * 0.08, frameTop - 8, width * 0.16, beltY - frameTop - 18);
    pixelRect(context, center - width * 0.12, frameTop - 4, width * 0.24, 4, "#ffb38e");
  }
}

function drawCrate(
  context: CanvasRenderingContext2D,
  actor: Actor,
  scale: number,
  time: number,
  reducedMotion: boolean,
) {
  const crateWidth = 45 * scale;
  const crateHeight = 25 * scale;
  const bob = reducedMotion ? 0 : Math.round(Math.sin(time / 260 + hash(actor.issue.id)) * 2);
  const launchProgress = actor.launchStarted
    ? Math.min(1, (time - actor.launchStarted) / 1300)
    : 0;
  const launchLift =
    actor.launchStarted && !reducedMotion
      ? Math.sin(launchProgress * Math.PI) * 92 * scale
      : 0;
  if (launchProgress >= 1) actor.launchStarted = undefined;
  const x = actor.currentX - crateWidth / 2;
  const y = actor.currentY - crateHeight + bob - launchLift;
  pixelRect(context, x, y, crateWidth, crateHeight, "#6f3c29");
  pixelRect(context, x + 3, y + 3, crateWidth - 6, crateHeight - 6, "#2b1914");
  pixelRect(context, x + 6, y + crateHeight / 2 - 1, crateWidth - 12, 2, "#ff6943");
  label(
    context,
    actor.issue.identifier,
    actor.currentX,
    y + crateHeight / 2,
    8 * scale,
    "#f6f1e8",
    "center",
  );

  const droidX = x - 15 * scale;
  const droidY = y + crateHeight - 2;
  pixelRect(context, droidX, droidY - 15 * scale, 12 * scale, 10 * scale, "#282b2e");
  pixelRect(context, droidX + 2 * scale, droidY - 13 * scale, 3 * scale, 3 * scale, "#ff6943");
  pixelRect(context, droidX + 8 * scale, droidY - 13 * scale, 3 * scale, 3 * scale, "#ff6943");
  pixelRect(context, droidX + 2 * scale, droidY - 5 * scale, 3 * scale, 6 * scale, "#b1aaa1");
  pixelRect(context, droidX + 8 * scale, droidY - 5 * scale, 3 * scale, 6 * scale, "#b1aaa1");
  const leg = reducedMotion ? 0 : Math.sin(time / 100 + hash(actor.issue.id)) * 3 * scale;
  pixelRect(context, droidX + 1 * scale, droidY, 3 * scale, 6 * scale + leg, "#ff6943");
  pixelRect(context, droidX + 8 * scale, droidY, 3 * scale, 6 * scale - leg, "#ff6943");
}

function drawSpeechBubble(
  context: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  width: number,
) {
  const safeText = text.length > 32 ? `${text.slice(0, 29)}...` : text;
  pixelRect(context, centerX - width / 2, y, width, 22, "#f3f0ea");
  pixelRect(context, centerX - width / 2 + 3, y + 3, width - 6, 16, "#101010");
  pixelRect(context, centerX - 7, y + 22, 8, 5, "#f3f0ea");
  label(context, safeText, centerX, y + 11, 8, "#f3f0ea", "center");
}

function drawScene(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  snapshot: FloorSnapshot,
  actors: Map<string, Actor>,
  reducedMotion: boolean,
  time: number,
  delta: number,
) {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  if (width <= 0 || height <= 0) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const requiredWidth = Math.round(width * ratio);
  const requiredHeight = Math.round(height * ratio);
  if (canvas.width !== requiredWidth || canvas.height !== requiredHeight) {
    canvas.width = requiredWidth;
    canvas.height = requiredHeight;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, width, height);
  pixelRect(context, 0, 0, width, height, "#070809");

  context.strokeStyle = "#121416";
  context.lineWidth = 1;
  for (let x = 0; x < width; x += 16) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y < height; y += 16) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  const top = Math.max(18, height * 0.08);
  const beltY = height * 0.72;
  const machineWidth = width / MACHINES.length;
  const pullByIdentifier = pullMap(snapshot.pulls);
  const grouped = new Map<AssemblyMachine, BoothIssue[]>(
    MACHINES.map((machine) => [machine.id, []]),
  );
  for (const issue of snapshot.issues) {
    const pull = pullByIdentifier.get(issue.identifier.toUpperCase());
    grouped.get(machineForTicket(issue, pull))?.push(issue);
  }

  const checks = snapshot.pulls.some((pull) => pull.checks === "failed")
    ? "failed"
    : snapshot.pulls.some((pull) => pull.checks === "pending")
      ? "pending"
      : snapshot.pulls.some((pull) => pull.checks === "passed")
        ? "passed"
        : "idle";

  MACHINES.forEach((machine, index) => {
    drawMachine(
      context,
      machine,
      index * machineWidth,
      machineWidth,
      top,
      beltY,
      time,
      checks,
      reducedMotion,
    );
  });

  pixelRect(context, 0, beltY, width, 9, "#26292b");
  pixelRect(context, 0, beltY + 9, width, 5, "#0e0f10");
  const beltOffset = reducedMotion ? 0 : (time / 9) % 24;
  for (let x = -24 + beltOffset; x < width; x += 24) {
    pixelRect(context, x, beltY + 2, 12, 4, "#8c4a37");
  }

  const nextIds = new Set<string>();
  MACHINES.forEach((machine, machineIndex) => {
    const tickets = grouped.get(machine.id) ?? [];
    tickets.forEach((issue, ticketIndex) => {
      const pull = pullByIdentifier.get(issue.identifier.toUpperCase());
      const columns = machine.id === "intake" || machine.id === "launch" ? 3 : 2;
      const row = Math.floor(ticketIndex / columns);
      const column = ticketIndex % columns;
      const spacing = Math.min(58, machineWidth / Math.max(columns, 1));
      const targetX =
        machineIndex * machineWidth +
        machineWidth / 2 +
        (column - (columns - 1) / 2) * spacing;
      const targetY = beltY - row * 31 - 2;
      nextIds.add(issue.id);
      const current = actors.get(issue.id);
      if (current) {
        if (current.machine !== "launch" && machine.id === "launch") {
          current.launchStarted = time;
        }
        current.targetX = targetX;
        current.targetY = targetY;
        current.machine = machine.id;
        current.issue = issue;
        current.pull = pull;
      } else {
        actors.set(issue.id, {
          currentX: targetX,
          currentY: targetY,
          targetX,
          targetY,
          machine: machine.id,
          issue,
          pull,
        });
      }
    });
  });
  for (const id of actors.keys()) {
    if (!nextIds.has(id)) actors.delete(id);
  }

  let moving = false;
  for (const actor of actors.values()) {
    if (reducedMotion) {
      actor.currentX = actor.targetX;
      actor.currentY = actor.targetY;
    } else {
      const progress = Math.min(1, delta / 520);
      actor.currentX += (actor.targetX - actor.currentX) * progress;
      actor.currentY += (actor.targetY - actor.currentY) * progress;
    }
    if (
      Math.abs(actor.targetX - actor.currentX) > 1 ||
      Math.abs(actor.targetY - actor.currentY) > 1
    ) {
      moving = true;
    }
    drawCrate(
      context,
      actor,
      Math.max(0.72, Math.min(1.1, width / 1450)),
      time,
      reducedMotion,
    );
  }

  const workbenchActors = [...actors.values()].filter(
    (actor) => actor.machine === "workbench",
  );
  if (workbenchActors.length > 0) {
    const actor =
      workbenchActors[
        Math.floor((reducedMotion ? 0 : time / 3200) % workbenchActors.length)
      ];
    drawSpeechBubble(
      context,
      detailForTicket(actor.issue, actor.pull),
      machineWidth * 1.5,
      top + 22,
      Math.min(210, machineWidth * 0.82),
    );
  }

  const shipped = snapshot.issues.filter(
    (issue) => machineForTicket(issue, pullByIdentifier.get(issue.identifier)) === "launch",
  ).length;
  const launchCenter = machineWidth * 4.5;
  pixelRect(context, launchCenter - 60, beltY + 21, 120, 7, "#7f5438");
  for (let crate = 0; crate < Math.min(5, shipped); crate += 1) {
    const crateX = launchCenter - 42 + (crate % 3) * 29;
    const crateY = beltY + 16 - Math.floor(crate / 3) * 18;
    pixelRect(context, crateX, crateY - 15, 25, 15, "#6f3c29");
    pixelRect(context, crateX + 3, crateY - 12, 19, 9, "#241612");
  }
  label(context, `Shipped ${shipped}`, launchCenter, beltY + 37, 9, "#f3f0ea", "center");

  if (shipped > 0) {
    const flip = reducedMotion ? 1 : Math.max(0.15, Math.abs(Math.cos(time / 1100)));
    const tileWidth = 112 * flip;
    pixelRect(context, launchCenter - tileWidth / 2, top + 2, tileWidth, 25, "#ff4b24");
    if (flip > 0.55) {
      label(context, "Construction complete", launchCenter, top + 14, 8, "#080808", "center");
    }
  }

  if (!moving) {
    const patrol = reducedMotion ? 0 : (time / 28) % width;
    const idleX = [patrol, width - patrol, machineWidth * 2.5 + Math.sin(time / 600) * 28];
    idleX.forEach((x, index) => {
      const y = beltY + 44;
      pixelRect(context, x, y - 12, 10, 9, "#34383b");
      pixelRect(context, x + 2, y - 10, 2, 2, "#ff6943");
      pixelRect(context, x + 7, y - 10, 2, 2, "#ff6943");
      pixelRect(context, x + 1, y - 3, 3, 5, index === 1 ? "#55ff88" : "#aaa");
      pixelRect(context, x + 7, y - 3, 3, 5, "#aaa");
      if (index === 2) {
        context.strokeStyle = "#8c8f91";
        context.beginPath();
        context.moveTo(x + 10, y - 4);
        context.lineTo(x + 17, y + 5);
        context.stroke();
      }
    });
  }
}

function celebrateFeatureTile(identifier: string, reducedMotion: boolean) {
  const index = featureIndexForTicket(identifier);
  if (index === undefined) return;
  const tile = document.querySelectorAll<HTMLElement>(".feature-cell")[index];
  if (!tile) return;
  const badge = document.createElement("div");
  badge.textContent = "CONSTRUCTION COMPLETE";
  badge.style.cssText = [
    "position:absolute",
    "inset:0",
    "display:grid",
    "place-items:center",
    "z-index:20",
    "background:#ff4b24",
    "color:#080808",
    "font:900 clamp(0.5rem,0.8vw,1rem) ui-monospace,monospace",
    "letter-spacing:0.1em",
    "text-align:center",
  ].join(";");
  tile.style.position = "relative";
  tile.append(badge);
  if (!reducedMotion) {
    tile.animate(
      [
        { transform: "perspective(700px) rotateX(0deg)" },
        { transform: "perspective(700px) rotateX(88deg)" },
        { transform: "perspective(700px) rotateX(0deg)" },
      ],
      { duration: 1150, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
  }
  window.setTimeout(() => badge.remove(), reducedMotion ? 1600 : 2400);
}

export function PixelMascot() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actorsRef = useRef(new Map<string, Actor>());
  const [snapshot, setSnapshot] = useState<FloorSnapshot>({
    issues: [],
    pulls: [],
  });
  const [connected, setConnected] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const reducedMotionRef = useRef(false);
  const mergedBaseline = useRef<Set<string> | null>(null);
  const inFlight = useRef(false);

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
      const merged = new Set(
        github.ticketPullRequests
          .filter((pull) => pull.state === "merged")
          .map((pull) => pull.identifier),
      );
      if (mergedBaseline.current) {
        for (const identifier of merged) {
          if (!mergedBaseline.current.has(identifier)) {
            celebrateFeatureTile(identifier, reducedMotionRef.current);
          }
        }
      }
      mergedBaseline.current = merged;
      setSnapshot({
        issues: board.configured ? board.issues : [],
        pulls: github.configured ? github.ticketPullRequests : [],
      });
      setConnected(board.configured || github.configured);
    } catch {
      setConnected(false);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      reducedMotionRef.current = media.matches;
      setReducedMotion(media.matches);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(refresh, 0);
    const interval = window.setInterval(refresh, POLL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let animation = 0;
    let previous = performance.now();
    const frame = (time: number) => {
      const delta = Math.min(64, time - previous);
      previous = time;
      drawScene(
        canvas,
        context,
        snapshot,
        actorsRef.current,
        reducedMotion,
        reducedMotion ? 0 : time,
        delta,
      );
      if (!reducedMotion) animation = requestAnimationFrame(frame);
    };
    frame(performance.now());
    return () => cancelAnimationFrame(animation);
  }, [reducedMotion, snapshot]);

  const pulls = useMemo(() => pullMap(snapshot.pulls), [snapshot.pulls]);
  const machineCounts = useMemo(
    () =>
      MACHINES.map((machine) => ({
        ...machine,
        count: snapshot.issues.filter(
          (issue) =>
            machineForTicket(
              issue,
              pulls.get(issue.identifier.toUpperCase()),
            ) === machine.id,
        ).length,
      })),
    [pulls, snapshot.issues],
  );
  const events = useMemo(
    () => buildFactoryFloorEvents(snapshot.issues, snapshot.pulls),
    [snapshot],
  );
  const ticker = events.length
    ? events
    : [
        {
          text: connected
            ? "Assembly line is standing by"
            : "Connecting live assembly line",
          timestamp: "",
        },
      ];

  return (
    <div className="pixel-factory-floor" data-connected={connected}>
      <header className="pixel-factory-header">
        <strong>Factory Floor</strong>
        <span><i /> Live data from Linear and GitHub.</span>
      </header>
      <canvas
        ref={canvasRef}
        className="pixel-factory-canvas"
        role="img"
        aria-label="Animated pixel art assembly line carrying live ticket crates through five machines"
      />
      <div className="pixel-factory-summary">
        {machineCounts.map((machine) => (
          <section
            key={machine.id}
            aria-label={`${machine.label}, ${machine.count} tickets`}
          >
            <h2>{machine.label}</h2>
          </section>
        ))}
      </div>
      <section className="pixel-factory-ticker" aria-label="Recent build events">
        <div>
          {[...ticker, ...ticker].map((event, index) => (
            <span key={`${event.text}-${index}`}>
              <i /> {event.text}
            </span>
          ))}
        </div>
      </section>
      <style>{pixelFactoryStyles}</style>
    </div>
  );
}

const pixelFactoryStyles = `
.pixel-factory-floor {
  position: relative;
  display: grid !important;
  grid-template-rows: auto 1fr auto;
  height: 100%;
  min-height: 0;
  padding: 0 !important;
  overflow: hidden;
  border: 1px solid #3b3b3b;
  background: #070809;
  color: #f3f0ea !important;
  box-shadow: inset 0 0 38px rgba(255, 75, 36, 0.05) !important;
}
.pixel-factory-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.28rem 0.55rem 0.22rem;
  border-bottom: 1px solid #303030;
}
.pixel-factory-header strong {
  color: #f3f0ea;
  font-size: clamp(0.58rem, 0.78vw, 0.96rem);
  letter-spacing: 0.12em;
}
.pixel-factory-header span {
  display: flex;
  align-items: center;
  gap: 0.38rem;
  color: #aaa7a1;
  font-size: clamp(0.38rem, 0.5vw, 0.64rem);
  letter-spacing: 0.08em;
}
.pixel-factory-header span i {
  width: 0.34rem;
  height: 0.34rem;
  border-radius: 50%;
  background: #4cff82;
  box-shadow: 0 0 7px #4cff82;
}
.pixel-factory-floor[data-connected="false"] .pixel-factory-header span i {
  background: #ff7a42;
  box-shadow: 0 0 7px #ff4b24;
}
.pixel-factory-canvas {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
}
.pixel-factory-summary {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}
.pixel-factory-ticker {
  overflow: hidden;
  border-top: 1px solid #303030;
  background: #050505;
}
.pixel-factory-ticker > div {
  display: flex;
  width: max-content;
  padding: 0.22rem 0;
  animation: pixel-factory-ticker 32s linear infinite;
}
.pixel-factory-ticker span {
  display: inline-flex;
  align-items: center;
  gap: 0.34rem;
  padding-right: 2.4rem;
  color: #bbb6ae;
  font-size: clamp(0.34rem, 0.47vw, 0.6rem);
  letter-spacing: 0.09em;
  white-space: nowrap;
}
.pixel-factory-ticker span i {
  width: 0.26rem;
  height: 0.26rem;
  background: #ff4b24;
  transform: rotate(45deg);
}
@keyframes pixel-factory-ticker {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .pixel-factory-ticker > div {
    animation: none !important;
  }
}
`;
