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

const litLeds = WORD.split("").flatMap((letter, index) =>
  GLYPHS[letter].flatMap((row, y) =>
    row.split("").flatMap((cell, x) =>
      cell === "#" ? [{ x: index * (GLYPH_WIDTH + 1) + x + 0.5, y: y + 0.5 }] : [],
    ),
  ),
);

const viewBox = `0 0 ${COLUMNS} ${GLYPH_HEIGHT}`;

// The cell inherits flex and padding from the wall grid, so layout is pinned
// inline. Keyframes live in a scoped style tag to keep the feature in one file.
const styles = `
.booth-wordmark-scan {
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 45%, #000 55%, transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0%, #000 45%, #000 55%, transparent 100%);
  -webkit-mask-size: 28% 100%;
  mask-size: 28% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: -60% 0;
  mask-position: -60% 0;
  animation: booth-wordmark-sweep 6s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  will-change: mask-position;
}

@keyframes booth-wordmark-sweep {
  0% { -webkit-mask-position: -60% 0; mask-position: -60% 0; }
  65%, 100% { -webkit-mask-position: 160% 0; mask-position: 160% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .booth-wordmark-scan {
    animation: none;
    opacity: 0;
  }
}
`;

const svgStyle = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  display: "block",
} as const;

function LedLayer({ fill }: { fill: string }) {
  return (
    <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" style={svgStyle} aria-hidden="true">
      {litLeds.map(({ x, y }) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={LED_RADIUS} fill={fill} />
      ))}
    </svg>
  );
}

export function AnimatedWordmark() {
  return (
    <div
      role="img"
      aria-label="Factory"
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "6% 7%",
        border: "1px solid #262626",
        background: "radial-gradient(ellipse at 50% 55%, rgba(255, 75, 36, 0.07), transparent 70%), #0d0d0d",
      }}
    >
      <style>{styles}</style>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" style={svgStyle} aria-hidden="true">
          <defs>
            <pattern id="booth-wordmark-led-grid" width="1" height="1" patternUnits="userSpaceOnUse">
              <circle cx="0.5" cy="0.5" r={LED_RADIUS} fill="#161616" />
            </pattern>
          </defs>
          <rect width={COLUMNS} height={GLYPH_HEIGHT} fill="url(#booth-wordmark-led-grid)" />
        </svg>
        <LedLayer fill="rgba(255, 75, 36, 0.62)" />
        <div
          className="booth-wordmark-scan"
          style={{ position: "absolute", inset: 0, filter: "drop-shadow(0 0 0.35em rgba(255, 106, 61, 0.75))" }}
        >
          <LedLayer fill="#ffd7c7" />
        </div>
      </div>
    </div>
  );
}
