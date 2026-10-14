const GLYPHS: Record<string, string[]> = {
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
};

const WORD = "FACTORY";
const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;
const COLUMNS = WORD.length * (GLYPH_WIDTH + 1) - 1;
const LED_RADIUS = 0.36;
const VIEW_BOX = `0 0 ${COLUMNS} ${GLYPH_HEIGHT}`;

// Width of the moving scan window as a share of the board.
const SCAN_SHARE = 0.16;
const SCAN_SPAN = 1 / SCAN_SHARE;
const SCAN_MS = 6000;

function dot(x: number, y: number) {
  const cx = x + 0.5;
  const cy = y + 0.5;
  return `M${cx - LED_RADIUS} ${cy}a${LED_RADIUS} ${LED_RADIUS} 0 1 0 ${LED_RADIUS * 2} 0a${LED_RADIUS} ${LED_RADIUS} 0 1 0 ${-LED_RADIUS * 2} 0`;
}

const litPath = WORD.split("")
  .flatMap((letter, index) =>
    GLYPHS[letter].flatMap((row, y) =>
      row.split("").flatMap((cell, x) => (cell === "#" ? [dot(index * (GLYPH_WIDTH + 1) + x, y)] : [])),
    ),
  )
  .join("");

const gridPath = Array.from({ length: GLYPH_HEIGHT }, (_, y) =>
  Array.from({ length: COLUMNS }, (_, x) => dot(x, y)).join(""),
).join("");

const percent = (value: number) => `${Number((value * 100).toFixed(3))}%`;

// The scan only moves transforms so it stays on the compositor: a narrow
// window slides across the board while the bright LED layer inside it slides
// the opposite way by the same distance, which keeps the bright LEDs pinned
// exactly over the dim ones. Translate percentages are relative to each
// element's own width, hence the SCAN_SPAN conversion.
// The wall grid styles `.feature-cell > div`, `strong`, and `span`, so layout
// is pinned inline and only div/svg elements are used.
const styles = `
.booth-wordmark-window,
.booth-wordmark-glow {
  animation-duration: ${SCAN_MS}ms;
  animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1);
  animation-iteration-count: infinite;
  will-change: transform;
}

.booth-wordmark-window {
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 38%, #000 62%, transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0%, #000 38%, #000 62%, transparent 100%);
  transform: translateX(-100%);
  animation-name: booth-wordmark-window;
}

.booth-wordmark-glow {
  transform: translateX(${percent(SCAN_SHARE)});
  animation-name: booth-wordmark-glow;
}

@keyframes booth-wordmark-window {
  0% { transform: translateX(-100%); }
  70%, 100% { transform: translateX(${percent(SCAN_SPAN)}); }
}

@keyframes booth-wordmark-glow {
  0% { transform: translateX(${percent(SCAN_SHARE)}); }
  70%, 100% { transform: translateX(-100%); }
}

@media (prefers-reduced-motion: reduce) {
  .booth-wordmark-window,
  .booth-wordmark-glow {
    animation: none;
  }

  .booth-wordmark-window {
    display: none;
  }
}
`;

const layer = {
  position: "absolute",
  top: 0,
  left: 0,
  height: "100%",
} as const;

function Leds({ path, fill }: { path: string; fill: string }) {
  return (
    <svg
      viewBox={VIEW_BOX}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", width: "100%", height: "100%" }}
    >
      <path d={path} fill={fill} />
    </svg>
  );
}

export function AnimatedWordmark() {
  return (
    <div
      role="img"
      aria-label="Factory wordmark"
      data-feature="animated-wordmark"
      style={{
        height: "100%",
        display: "block",
        padding: "5% 6%",
        border: "1px solid #262626",
        background: "#0d0d0d",
        boxShadow: "inset 0 0 22px rgba(255, 255, 255, 0.018)",
      }}
    >
      <style>{styles}</style>
      <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
        <div style={{ ...layer, width: "100%" }}>
          <Leds path={gridPath} fill="#171717" />
        </div>
        <div style={{ ...layer, width: "100%" }}>
          <Leds path={litPath} fill="rgba(255, 75, 36, 0.66)" />
        </div>
        <div className="booth-wordmark-window" style={{ ...layer, width: percent(SCAN_SHARE), overflow: "hidden" }}>
          <div
            className="booth-wordmark-glow"
            style={{ ...layer, width: percent(SCAN_SPAN), filter: "drop-shadow(0 0 0.3em rgba(255, 106, 61, 0.8))" }}
          >
            <Leds path={litPath} fill="#ffd7c7" />
          </div>
        </div>
      </div>
    </div>
  );
}
