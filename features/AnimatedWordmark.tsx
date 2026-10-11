const frame = {
  height: "100%",
  border: "1px dashed #5c5c5c",
  background: "#252525",
} as const;

export function AnimatedWordmark() {
  return <div style={frame}><strong>Animated Factory wordmark</strong><span>Under construction</span></div>;
}
