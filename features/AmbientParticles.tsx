import type { CSSProperties } from "react";

interface Layer {
  count: number;
  size: number;
  opacity: number;
  riseMs: number;
  color: string;
}

interface Particle {
  key: string;
  left: number;
  size: number;
  opacity: number;
  drift: number;
  duration: number;
  delay: number;
  color: string;
}

// Far layers are smaller, dimmer, and slower, which reads as depth without blur filters.
const LAYERS: Layer[] = [
  { count: 14, size: 2, opacity: 0.22, riseMs: 26000, color: "#9d9a94" },
  { count: 10, size: 3, opacity: 0.32, riseMs: 19000, color: "#f2efe7" },
  { count: 6, size: 4, opacity: 0.45, riseMs: 13000, color: "#ff6a3d" },
];

// Seeded so server and client render identical markup.
function seeded(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function buildField(): Particle[] {
  const next = seeded(0x6d2b79f5);
  return LAYERS.flatMap((layer, depth) =>
    Array.from({ length: layer.count }, (_, index) => {
      const duration = Math.round(layer.riseMs * (0.85 + next() * 0.3));
      return {
        key: `${depth}-${index}`,
        left: Math.round(((index + next()) / layer.count) * 1000) / 10,
        size: layer.size,
        opacity: layer.opacity,
        drift: Math.round((next() - 0.5) * 16),
        duration,
        // Negative delays start every particle mid-flight so the field is full on first paint.
        delay: -Math.round(next() * duration),
        color: layer.color,
      };
    }),
  );
}

const FIELD = buildField();

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
const labelSize = "clamp(0.45rem, min(0.62vw, 1.1vh), 1.2rem)";

// The wall grid styles `.feature-cell > div`, so layout is pinned inline and
// keyframes live in a scoped style tag to keep the feature in one file.
// Only transform and opacity animate, so the layer stays on the compositor.
const styles = `
.booth-particle {
  position: absolute;
  bottom: 0;
  border-radius: 50%;
  opacity: 0;
  will-change: transform, opacity;
  animation: booth-particle-rise var(--rise-ms) linear var(--rise-delay) infinite;
}

@keyframes booth-particle-rise {
  0% { opacity: 0; transform: translate3d(0, 2cqh, 0); }
  12% { opacity: var(--particle-opacity); }
  85% { opacity: var(--particle-opacity); }
  100% { opacity: 0; transform: translate3d(var(--particle-drift), -104cqh, 0); }
}

@media (prefers-reduced-motion: reduce) {
  .booth-particle {
    animation: none;
    opacity: var(--particle-opacity);
    transform: translate3d(0, var(--particle-rest), 0);
  }
}
`;

export function AmbientParticles() {
  return (
    <div
      role="img"
      aria-label="Ambient factory particles"
      style={{
        position: "relative",
        display: "block",
        height: "100%",
        padding: 0,
        border: "1px solid #262626",
        background: "#0d0d0d",
        overflow: "hidden",
        containerType: "size",
        contain: "strict",
        boxShadow: "none",
      }}
    >
      <style>{styles}</style>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          padding: 0,
          display: "block",
          pointerEvents: "none",
          boxShadow: "none",
        }}
      >
        {FIELD.map((particle, index) => (
          <i
            key={particle.key}
            className="booth-particle"
            style={
              {
                left: `${particle.left}%`,
                width: particle.size,
                height: particle.size,
                background: particle.color,
                "--rise-ms": `${particle.duration}ms`,
                "--rise-delay": `${particle.delay}ms`,
                "--particle-opacity": particle.opacity,
                "--particle-drift": `${particle.drift}cqw`,
                "--particle-rest": `-${10 + ((index * 37) % 80)}cqh`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <p
        style={{
          position: "absolute",
          top: "7%",
          left: "4%",
          zIndex: 1,
          margin: 0,
          padding: "0.35em 0.6em",
          fontFamily: mono,
          fontSize: labelSize,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#ff6a3d",
          // An opaque backing keeps every particle behind, never over, the label.
          background: "#0d0d0d",
        }}
      >
        Ambient particles
      </p>
    </div>
  );
}
