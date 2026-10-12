import type { ComponentType } from "react";
import { AmbientParticles } from "./AmbientParticles";
import { AnimatedWordmark } from "./AnimatedWordmark";
import { BoothStatus } from "./BoothStatus";
import { BuildPulse } from "./BuildPulse";
import { DroidFacts } from "./DroidFacts";
import { LiveDiff } from "./LiveDiff";
import { MergeConfetti } from "./MergeConfetti";
import { PixelMascot } from "./PixelMascot";
import { ReactionMeter } from "./ReactionMeter";
import { ShippedTicker } from "./ShippedTicker";
import { TicketToLive } from "./TicketToLive";
import { VisitorClock } from "./VisitorClock";

export interface FeatureRegistration {
  key: string;
  title: string;
  placement: { column: string; row: string };
  Component: ComponentType;
}

export const featureRegistry: FeatureRegistration[] = [
  { key: "wordmark", title: "Animated Factory wordmark", placement: { column: "1 / 3", row: "1" }, Component: AnimatedWordmark },
  { key: "visitor-clock", title: "Visitor clock", placement: { column: "3", row: "1" }, Component: VisitorClock },
  { key: "droid-facts", title: "Droid facts", placement: { column: "4", row: "1" }, Component: DroidFacts },
  { key: "merge-confetti", title: "Merge confetti", placement: { column: "5", row: "1" }, Component: MergeConfetti },
  { key: "build-pulse", title: "Build pulse", placement: { column: "1", row: "2" }, Component: BuildPulse },
  { key: "ticket-to-live", title: "Ticket to Live", placement: { column: "2 / 4", row: "2" }, Component: TicketToLive },
  { key: "ambient-particles", title: "Ambient particles", placement: { column: "4 / 6", row: "2" }, Component: AmbientParticles },
  { key: "shipped-ticker", title: "Shipped ticker", placement: { column: "1 / 3", row: "3" }, Component: ShippedTicker },
  { key: "booth-status", title: "Booth status", placement: { column: "3", row: "3" }, Component: BoothStatus },
  { key: "reaction-meter", title: "Reaction meter", placement: { column: "4", row: "3" }, Component: ReactionMeter },
  { key: "live-diff", title: "Live Diff", placement: { column: "5", row: "3" }, Component: LiveDiff },
  { key: "factory-floor", title: "Factory Floor", placement: { column: "1 / 6", row: "4" }, Component: PixelMascot },
];
