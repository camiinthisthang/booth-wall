import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { createQrMatrix, renderQrPixels } from "@/lib/qr-code";
import { QR_DESIGNS, scanUrl } from "@/lib/qr-designs";

describe("Start building QR codes", () => {
  it.each([
    ["production", "https://booth-wall.vercel.app"],
    [
      "preview",
      "https://booth-wall-git-droid-booth-22.example.vercel.app",
    ],
  ] as const)(
    "decodes every design against the %s deployment host",
    (_environment, origin) => {
      for (const design of QR_DESIGNS) {
        const expected = scanUrl(origin, design.key);
        const pixels = renderQrPixels(createQrMatrix(expected), 10);
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
