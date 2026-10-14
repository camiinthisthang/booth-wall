import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import {
  createQrMatrix,
  QR_MAX_VERSION,
  renderQrPixels,
} from "@/lib/qr-code";
import { QR_DESIGNS, scanUrl } from "@/lib/qr-designs";

describe("Start building QR codes", () => {
  it.each([
    ["production", "https://booth-wall.vercel.app"],
    [
      "preview",
      "https://booth-wall-git-droid-booth-22-buil-1578a9-somarcamilas-projects.vercel.app",
    ],
  ] as const)(
    "keeps every design scannable on the %s deployment host",
    (_environment, origin) => {
      for (const design of QR_DESIGNS) {
        const expected = scanUrl(origin, design.key);
        const matrix = createQrMatrix(expected);
        expect(matrix.version).toBeLessThanOrEqual(QR_MAX_VERSION);
        const pixels = renderQrPixels(matrix, 3);
        const decoded = jsQR(pixels.data, pixels.width, pixels.height, {
          inversionAttempts: "dontInvert",
        });

        expect(decoded?.data).toBe(expected);
        expect(pixels.data.slice(0, 4)).toEqual(
          new Uint8ClampedArray([255, 255, 255, 255]),
        );
      }
    },
  );
});
