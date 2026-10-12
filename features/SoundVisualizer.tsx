"use client";

import { useEffect, useRef, useState } from "react";

const BARS = 24;
const FFT_SIZE = 128;
const FLOOR = 0.04;
const ATTACK = 0.55;
const RELEASE = 0.12;

type Mode = "ambient" | "requesting" | "live" | "fallback";

type Status = { mode: Mode; message: string };

type AudioSession = { context: AudioContext; stream: MediaStream };

const AMBIENT_MESSAGE = "Ambient mode, no microphone needed";

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
const labelSize = "clamp(0.45rem, min(0.62vw, 1.1vh), 1.2rem)";
const buttonSize = "clamp(0.45rem, min(0.64vw, 1.14vh), 1.25rem)";
const noteSize = "clamp(0.45rem, min(0.62vw, 1.1vh), 1.2rem)";

// Layered sines give a slow, organic idle motion that never needs audio input.
function ambientLevel(index: number, seconds: number) {
  const position = index / (BARS - 1);
  const envelope = 0.55 + 0.45 * Math.sin(Math.PI * position);
  const wave =
    0.42 +
    0.24 * Math.sin(seconds * 1.7 + index * 0.55) +
    0.16 * Math.sin(seconds * 2.9 - index * 0.31) +
    0.1 * Math.sin(seconds * 0.6 + index * 1.3);
  return Math.min(1, Math.max(0, wave * envelope));
}

// Squared band edges give low frequencies, where most voice and music energy
// sits, more bars than a linear split would.
function bandLevel(bins: Uint8Array, index: number) {
  const start = Math.floor((index / BARS) ** 2 * bins.length);
  const end = Math.max(start + 1, Math.floor(((index + 1) / BARS) ** 2 * bins.length));
  let sum = 0;
  for (let bin = start; bin < end; bin += 1) sum += bins[bin];
  return sum / (end - start) / 255;
}

function audioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  const scope = window as Window & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return scope.AudioContext ?? scope.webkitAudioContext;
}

function closeSession(session: AudioSession | null) {
  if (!session) return;
  session.stream.getTracks().forEach((track) => track.stop());
  void session.context.close().catch(() => undefined);
}

function fallbackMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone blocked, showing ambient mode";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone found, showing ambient mode";
  return "Microphone unavailable, showing ambient mode";
}

// The wall grid styles `.feature-cell > div`, `strong`, and `span`, so layout
// is pinned inline, those elements are avoided, and focus and motion rules
// live in a scoped style tag to keep the feature in one file.
const styles = `
.booth-sound-bar {
  display: block;
  flex: 1;
  min-width: 0;
  height: 100%;
  border-radius: 1px;
  transform-origin: 50% 100%;
  transform: scaleY(${FLOOR});
  will-change: transform;
}

.booth-sound-button {
  align-self: flex-start;
  min-width: 0;
  max-width: 100%;
  padding: 0.45em 0.8em;
  border: 1px solid #343434;
  border-radius: 2px;
  background: #151515;
  color: #f2efe7;
  font-family: ${mono};
  font-size: ${buttonSize};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: border-color 160ms ease;
}

.booth-sound-button:hover {
  border-color: #ff6a3d;
}

.booth-sound-button:focus-visible {
  outline: 2px solid #ffb627;
  outline-offset: 1px;
}

.booth-sound-button[aria-disabled="true"] {
  color: #6e6e6e;
  cursor: progress;
}

@media (prefers-reduced-motion: reduce) {
  .booth-sound-button {
    transition: none;
  }
}
`;

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

const barColor = (index: number) => (index % 6 === 5 ? "#ffb627" : "#ff6a3d");

export function SoundVisualizer() {
  const [status, setStatus] = useState<Status>({ mode: "ambient", message: AMBIENT_MESSAGE });
  const barRefs = useRef<(HTMLElement | null)[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sessionRef = useRef<AudioSession | null>(null);
  const mountedRef = useRef(false);

  // Bars are written directly through refs so the 60 fps loop never
  // re-renders React. Without an analyser the loop runs the ambient pattern.
  useEffect(() => {
    mountedRef.current = true;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const levels = new Float32Array(BARS);
    let bins: Uint8Array<ArrayBuffer> | null = null;
    let frame = 0;

    const draw = (time: number) => {
      const analyser = analyserRef.current;
      if (analyser) {
        if (!bins || bins.length !== analyser.frequencyBinCount) {
          bins = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(bins);
      }
      const seconds = reducedMotion.matches ? 0 : time / 1000;
      for (let index = 0; index < BARS; index += 1) {
        const target = analyser && bins ? bandLevel(bins, index) : ambientLevel(index, seconds);
        const current = levels[index];
        levels[index] = current + (target - current) * (target > current ? ATTACK : RELEASE);
        const bar = barRefs.current[index];
        if (bar) bar.style.transform = `scaleY(${Math.max(FLOOR, levels[index]).toFixed(3)})`;
      }
      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => {
      mountedRef.current = false;
      window.cancelAnimationFrame(frame);
      analyserRef.current = null;
      closeSession(sessionRef.current);
      sessionRef.current = null;
    };
  }, []);

  const stopListening = (next: Status) => {
    analyserRef.current = null;
    closeSession(sessionRef.current);
    sessionRef.current = null;
    setStatus(next);
  };

  // The microphone is only requested from an explicit tap, so the wall never
  // shows a permission prompt on load and works fully without one.
  const startListening = async () => {
    const AudioCtor = audioContextConstructor();
    if (!navigator.mediaDevices?.getUserMedia || !AudioCtor) {
      setStatus({ mode: "fallback", message: "Microphone unavailable, showing ambient mode" });
      return;
    }
    setStatus({ mode: "requesting", message: "Waiting for microphone permission" });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
    } catch (error) {
      if (mountedRef.current) setStatus({ mode: "fallback", message: fallbackMessage(error) });
      return;
    }
    if (!mountedRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    try {
      const context = new AudioCtor();
      const analyser = context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.72;
      // The source feeds only the analyser, never the speakers, so there is no feedback loop.
      context.createMediaStreamSource(stream).connect(analyser);
      if (context.state === "suspended") await context.resume();
      const session = { context, stream };
      sessionRef.current = session;
      analyserRef.current = analyser;
      stream.getAudioTracks().forEach((track) =>
        track.addEventListener("ended", () => {
          if (sessionRef.current !== session) return;
          stopListening({ mode: "fallback", message: "Microphone disconnected, showing ambient mode" });
        }),
      );
      setStatus({ mode: "live", message: "Listening to the booth" });
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      setStatus({ mode: "fallback", message: fallbackMessage(error) });
    }
  };

  const onToggle = () => {
    if (status.mode === "requesting") return;
    if (status.mode === "live") {
      stopListening({ mode: "ambient", message: AMBIENT_MESSAGE });
      return;
    }
    void startListening();
  };

  const live = status.mode === "live";
  const buttonText = live ? "Stop listening" : status.mode === "requesting" ? "Requesting" : "Listen";

  return (
    <div
      role="region"
      aria-label="Sound visualizer"
      data-sound-mode={status.mode}
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "0.35em",
        padding: "6% 7%",
        border: `1px solid ${live ? "#ff6a3d" : "#262626"}`,
        background: "#0d0d0d",
        color: "#f2efe7",
        overflow: "hidden",
      }}
    >
      <style>{styles}</style>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.5em", padding: 0 }}>
        <p style={label}>Sound visualizer</p>
        <p style={{ ...label, color: live ? "#ff6a3d" : "#9d9a94" }}>{live ? "Live" : "Ambient"}</p>
      </div>
      <div
        aria-hidden="true"
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "3%",
          padding: 0,
          boxShadow: "none",
        }}
      >
        {Array.from({ length: BARS }, (_, index) => (
          <i
            key={index}
            ref={(element) => {
              barRefs.current[index] = element;
            }}
            className="booth-sound-bar"
            style={{ background: barColor(index), opacity: live ? 1 : 0.7 }}
          />
        ))}
      </div>
      <button
        type="button"
        className="booth-sound-button"
        aria-pressed={live}
        aria-disabled={status.mode === "requesting"}
        onClick={onToggle}
      >
        {buttonText}
      </button>
      <p aria-live="polite" style={{ ...note, color: status.mode === "fallback" ? "#ffb627" : note.color }}>
        {status.message}
      </p>
    </div>
  );
}
