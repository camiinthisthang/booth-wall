export const QR_DESIGN_KEYS = [
  "detected",
  "wireframe",
  "terrain",
  "session",
] as const;

export type QrDesignKey = (typeof QR_DESIGN_KEYS)[number];

const FACTORY_DESTINATIONS: Record<QrDesignKey, string> = {
  detected: "https://factory.com/",
  wireframe: "https://factory.com/enterprise",
  terrain: "https://factory.com/contact",
  session: "https://docs.factory.com/",
};

export interface QrDesign {
  key: QrDesignKey;
  name: string;
  line: string;
}

export const QR_DESIGNS: readonly QrDesign[] = [
  {
    key: "detected",
    name: "Detected",
    line: "Build your own software factory",
  },
  {
    key: "wireframe",
    name: "Wireframe",
    line: "Put your backlog on autopilot",
  },
  {
    key: "terrain",
    name: "Terrain",
    line: "Your team sets the goals. Droids ship the code.",
  },
  {
    key: "session",
    name: "Session",
    line: "Start a Droid in one command",
  },
] as const;

export function isQrDesign(value: string): value is QrDesignKey {
  return QR_DESIGN_KEYS.includes(value as QrDesignKey);
}

export function scanPath(design: QrDesignKey) {
  return `/go/${design}`;
}

export function scanUrl(origin: string, design: QrDesignKey) {
  return new URL(scanPath(design), origin).toString();
}

export function factoryRedirectUrl(design: QrDesignKey) {
  const destination = new URL(FACTORY_DESTINATIONS[design]);
  destination.searchParams.set("utm_source", "booth");
  destination.searchParams.set("utm_content", design);
  return destination;
}
