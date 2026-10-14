"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  QR_DESIGNS,
  scanUrl,
  type QrDesignKey,
} from "@/lib/qr-designs";
import {
  createQrMatrix,
  qrSvgPath,
  QR_QUIET_ZONE,
} from "@/lib/qr-code";

const ROTATION_MS = 12_000;
const SCAN_POLL_MS = 5_000;
const CANONICAL_ORIGIN = "https://booth-wall.vercel.app";
const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
const subscribeToOrigin = () => () => {};

function useScanOrigin() {
  return useSyncExternalStore(
    subscribeToOrigin,
    () => window.location.origin,
    () => CANONICAL_ORIGIN,
  );
}

const styles = `
.booth-start-building {
  container-type: size;
}

.booth-start-building__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.booth-start-building__qr {
  position: relative;
  z-index: 2;
  height: 88%;
  max-height: 7rem;
  aspect-ratio: 1;
  flex: 0 0 auto;
  filter: drop-shadow(0 0.25rem 0.7rem rgba(0, 0, 0, 0.28));
}

.booth-start-building__qr svg {
  display: block;
  width: 100%;
  height: 100%;
  shape-rendering: crispEdges;
}

.booth-start-building__finder {
  display: none;
  position: absolute;
  z-index: 3;
  width: 20%;
  height: 20%;
  border: 1px solid #ff3028;
  pointer-events: none;
}

.booth-start-building__finder::after {
  content: "DROID 0.98";
  position: absolute;
  left: 0;
  bottom: calc(100% + 1px);
  color: #ff3028;
  font: 700 clamp(0.28rem, 0.4vw, 0.52rem)/1 ${mono};
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.booth-start-building[data-design="detected"] .booth-start-building__finder {
  display: block;
}

.booth-start-building__finder--tl {
  top: -3%;
  left: -3%;
  border-right: 0;
  border-bottom: 0;
}

.booth-start-building__finder--tr {
  top: -3%;
  right: -3%;
  border-left: 0;
  border-bottom: 0;
}

.booth-start-building__finder--bl {
  bottom: -3%;
  left: -3%;
  border-right: 0;
  border-top: 0;
}

.booth-start-building__finder--bl::after {
  top: calc(100% + 1px);
  bottom: auto;
}

.booth-start-building__copy {
  position: relative;
  z-index: 2;
  min-width: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0;
}

.booth-start-building__eyebrow,
.booth-start-building__meta,
.booth-start-building__line {
  margin: 0;
  font-family: ${mono};
  text-transform: uppercase;
}

.booth-start-building__eyebrow {
  color: #f5f5f2;
  font-size: clamp(0.34rem, min(0.48vw, 0.82vh), 0.75rem);
  letter-spacing: 0.14em;
}

.booth-start-building__title {
  margin: 0.03em 0;
  color: #fff;
  font-size: clamp(0.9rem, min(1.55vw, 2.8vh), 2rem);
  font-weight: 950;
  letter-spacing: -0.075em;
  line-height: 0.84;
}

.booth-start-building__line {
  max-width: 25ch;
  color: #e7e7e3;
  font-size: clamp(0.32rem, min(0.43vw, 0.72vh), 0.65rem);
  font-weight: 700;
  letter-spacing: 0.035em;
  line-height: 1.25;
}

.booth-start-building__meta {
  display: flex;
  align-items: center;
  gap: 0.65em;
  color: #ddd;
  font-size: clamp(0.29rem, min(0.38vw, 0.64vh), 0.58rem);
  letter-spacing: 0.08em;
}

.booth-start-building__meta b {
  color: #fff;
  font-size: 1.4em;
  font-variant-numeric: tabular-nums;
}

.booth-start-building__dots {
  display: flex;
  gap: 0.22rem;
}

.booth-start-building__dot {
  width: 0.25rem;
  height: 0.12rem;
  border: 0;
  background: #747474;
}

.booth-start-building__dot[data-active="true"] {
  width: 0.55rem;
  background: #fff;
}

@media (prefers-reduced-motion: reduce) {
  .booth-start-building__canvas {
    animation: none;
  }
}
`;

function seeded(index: number, salt: number) {
  const value = Math.sin(index * 9187.13 + salt * 781.31) * 43758.5453;
  return value - Math.floor(value);
}

function line(
  context: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  color: string,
  width = 1,
) {
  context.strokeStyle = color;
  context.lineWidth = width;
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
}

function drawClouds(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  reducedMotion: boolean,
) {
  context.fillStyle = "#88cffa";
  context.fillRect(0, 0, width, height);
  context.globalAlpha = 0.45;
  for (let index = 0; index < 9; index += 1) {
    const cloudWidth = width * (0.12 + seeded(index, 1) * 0.16);
    const x =
      ((seeded(index, 2) * (width + cloudWidth) +
        (reducedMotion ? 0 : time * (0.006 + seeded(index, 3) * 0.005))) %
        (width + cloudWidth)) -
      cloudWidth;
    const y = seeded(index, 4) * height * 0.78;
    const unit = Math.max(4, height * 0.055);
    context.fillStyle = index % 3 === 0 ? "#fff" : "#d8effd";
    context.fillRect(x, y, cloudWidth, unit);
    context.fillRect(x + unit, y - unit, cloudWidth * 0.56, unit);
    context.fillRect(x + unit * 2, y - unit * 2, cloudWidth * 0.25, unit);
  }
  context.globalAlpha = 1;
}

function drawWireframe(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  reducedMotion: boolean,
) {
  context.fillStyle = "#0b0c0d";
  context.fillRect(0, 0, width, height);
  const cx = width * 0.76;
  const cy = height * 0.52;
  const size = Math.min(width * 0.3, height * 0.78);
  const spin = reducedMotion ? 0.25 : time * 0.00016;

  for (let ring = 0; ring < 7; ring += 1) {
    context.strokeStyle = `rgba(235,235,232,${0.18 + ring * 0.045})`;
    context.lineWidth = 1;
    context.beginPath();
    context.ellipse(
      cx,
      cy + (ring - 3) * size * 0.07,
      size * (0.4 + Math.sin(spin + ring * 0.35) * 0.08),
      size * 0.11,
      spin,
      0,
      Math.PI * 2,
    );
    context.stroke();
  }

  const top: [number, number] = [cx, cy - size * 0.58];
  const right: [number, number] = [cx + size * 0.55, cy - size * 0.27];
  const bottom: [number, number] = [cx, cy + size * 0.07];
  const left: [number, number] = [cx - size * 0.55, cy - size * 0.27];
  const drop = size * 0.78;
  line(context, [top, right, bottom, left, top], "#96999b");
  line(
    context,
    [
      [left[0], left[1] + drop],
      [bottom[0], bottom[1] + drop],
      [right[0], right[1] + drop],
    ],
    "#66696b",
  );
  line(context, [left, [left[0], left[1] + drop]], "#66696b");
  line(context, [bottom, [bottom[0], bottom[1] + drop]], "#66696b");
  line(context, [right, [right[0], right[1] + drop]], "#66696b");
}

function terrainHeight(x: number, y: number, time: number) {
  return (
    Math.sin(x * 0.72 + time) * 0.55 +
    Math.cos(y * 0.88 - time * 0.7) * 0.5 +
    Math.sin((x + y) * 0.43) * 0.35
  );
}

function drawTerrain(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  reducedMotion: boolean,
) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#151515");
  gradient.addColorStop(1, "#777");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  const rows = 11;
  const columns = 17;
  const phase = reducedMotion ? 0.8 : time * 0.00032;
  const amplitude = height * 0.07;

  for (let row = 0; row < rows; row += 1) {
    const points: Array<[number, number]> = [];
    for (let column = 0; column < columns; column += 1) {
      const x = ((column - 2) / (columns - 5)) * width;
      const baseY = height * 0.2 + row * height * 0.075;
      points.push([
        x + (row - rows / 2) * width * 0.018,
        baseY -
          terrainHeight(column * 0.7, row * 0.8, phase) * amplitude,
      ]);
    }
    line(context, points, `rgba(245,245,242,${0.14 + row * 0.035})`);
  }
  for (let column = 0; column < columns; column += 1) {
    const points: Array<[number, number]> = [];
    for (let row = 0; row < rows; row += 1) {
      const x = ((column - 2) / (columns - 5)) * width;
      const baseY = height * 0.2 + row * height * 0.075;
      points.push([
        x + (row - rows / 2) * width * 0.018,
        baseY -
          terrainHeight(column * 0.7, row * 0.8, phase) * amplitude,
      ]);
    }
    line(context, points, "rgba(225,225,220,0.16)");
  }
}

function drawSession(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  reducedMotion: boolean,
) {
  context.fillStyle = "#111";
  context.fillRect(0, 0, width, height);
  const code = [
    "$ factory run booth",
    "goal: start building",
    "reading BOOTH-22",
    "planning routes",
    "writing tests",
    "shipping code",
  ];
  context.font = `700 ${Math.max(7, height * 0.075)}px ${mono}`;
  context.fillStyle = "rgba(234,234,230,0.32)";
  const shift = reducedMotion ? 0 : (time * 0.012) % (height * 0.16);
  for (let row = -1; row < 9; row += 1) {
    context.fillText(
      code[(row + code.length * 2) % code.length],
      width * 0.05 + (row % 2) * width * 0.08,
      row * height * 0.16 + shift,
    );
  }

  const dot = Math.max(2, Math.floor(height * 0.025));
  for (let y = 0; y < height; y += dot) {
    for (let x = 0; x < width; x += dot) {
      if (
        seeded(x / dot, y / dot) >
        0.73 + Math.sin((x + y + time * 0.02) * 0.05) * 0.08
      ) {
        context.fillStyle =
          seeded(y / dot, x / dot) > 0.5
            ? "rgba(255,255,255,0.14)"
            : "rgba(0,0,0,0.34)";
        context.fillRect(x, y, dot, dot);
      }
    }
  }
}

function drawBackdrop(
  context: CanvasRenderingContext2D,
  design: QrDesignKey,
  width: number,
  height: number,
  time: number,
  reducedMotion: boolean,
) {
  context.clearRect(0, 0, width, height);
  if (design === "detected") {
    drawClouds(context, width, height, time, reducedMotion);
  } else if (design === "wireframe") {
    drawWireframe(context, width, height, time, reducedMotion);
  } else if (design === "terrain") {
    drawTerrain(context, width, height, time, reducedMotion);
  } else {
    drawSession(context, width, height, time, reducedMotion);
  }
  const copyScrim = context.createLinearGradient(0, 0, width * 0.72, 0);
  copyScrim.addColorStop(0, "rgba(0,0,0,0.82)");
  copyScrim.addColorStop(0.72, "rgba(0,0,0,0.48)");
  copyScrim.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = copyScrim;
  context.fillRect(0, 0, width * 0.72, height);
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function ProceduralBackdrop({
  design,
  reducedMotion,
}: {
  design: QrDesignKey;
  reducedMotion: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let observer: ResizeObserver | null = null;

    const render = (time: number) => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      drawBackdrop(context, design, width, height, time, reducedMotion);
      if (!reducedMotion) frame = requestAnimationFrame(render);
    };

    observer = new ResizeObserver(() => {
      if (reducedMotion) render(0);
    });
    observer.observe(canvas);
    render(0);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [design, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="booth-start-building__canvas"
    />
  );
}

function QrCode({ value }: { value: string }) {
  const matrix = useMemo(() => createQrMatrix(value), [value]);
  const size = matrix.size + QR_QUIET_ZONE * 2;
  const path = useMemo(() => qrSvgPath(matrix), [matrix]);

  return (
    <div className="booth-start-building__qr" data-qr-value={value}>
      <svg
        role="img"
        aria-label={`Scan to open ${value}`}
        viewBox={`0 0 ${size} ${size}`}
      >
        <rect width={size} height={size} fill="#fff" />
        <path d={path} fill="#080808" />
      </svg>
      <i className="booth-start-building__finder booth-start-building__finder--tl" />
      <i className="booth-start-building__finder booth-start-building__finder--tr" />
      <i className="booth-start-building__finder booth-start-building__finder--bl" />
    </div>
  );
}

const rootStyle: CSSProperties = {
  position: "relative",
  height: "100%",
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "4%",
  padding: "1.5% 4%",
  border: "1px solid #3d3d3d",
  background: "#111",
  color: "#fff",
  overflow: "hidden",
};

export function StartBuilding() {
  const [designIndex, setDesignIndex] = useState(0);
  const [totalToday, setTotalToday] = useState(0);
  const reducedMotion = useReducedMotion();
  const scanOrigin = useScanOrigin();
  const design = QR_DESIGNS[designIndex];

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => {
      setDesignIndex((current) => (current + 1) % QR_DESIGNS.length);
    }, ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/scans", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { totalToday?: unknown };
        if (
          active &&
          typeof payload.totalToday === "number" &&
          Number.isFinite(payload.totalToday)
        ) {
          setTotalToday(Math.max(0, Math.floor(payload.totalToday)));
        }
      } catch {
        // Keep the last confirmed count when the network is unavailable.
      }
    };
    void load();
    const timer = window.setInterval(load, SCAN_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div
      role="region"
      aria-label="Start building"
      className="booth-start-building"
      data-design={design.key}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      style={rootStyle}
    >
      <style>{styles}</style>
      <ProceduralBackdrop
        design={design.key}
        reducedMotion={reducedMotion}
      />
      <div className="booth-start-building__copy">
        <p className="booth-start-building__eyebrow">
          Factory / {design.name}
        </p>
        <h2 className="booth-start-building__title">Start building</h2>
        <p className="booth-start-building__line">{design.line}</p>
        <div className="booth-start-building__meta">
          <p>
            Today <b>{totalToday}</b>
          </p>
          <div className="booth-start-building__dots" aria-hidden="true">
            {QR_DESIGNS.map((entry, index) => (
              <i
                key={entry.key}
                className="booth-start-building__dot"
                data-active={index === designIndex ? "true" : "false"}
              />
            ))}
          </div>
        </div>
      </div>
      <QrCode value={scanUrl(scanOrigin, design.key)} />
    </div>
  );
}
