import { featureRegistry } from "@/features/registry";
import { WallHeader } from "./wall-header";

export default function WallPage() {
  return (
    <main className="wall-shell">
      <section className="wall-stage" aria-label="Live booth wall">
        <WallHeader />
        <div className="feature-grid">
          {featureRegistry.map(({ key, placement, Component }) => (
            <article
              className="feature-cell"
              key={key}
              style={{
                gridColumn: placement.column,
                gridRow: placement.row,
              }}
            >
              <Component />
            </article>
          ))}
        </div>
        <footer className="wall-footer">
          <span>LIVE BUILD FLOOR</span>
          <nav aria-label="Booth views">
            <a href="/board">Board</a>
            <a href="/vote">Vote</a>
          </nav>
        </footer>
      </section>
    </main>
  );
}
