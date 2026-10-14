import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { createQrMatrix, renderQrPixels } from "@/lib/qr-code";
import { QR_DESIGNS, scanUrl } from "@/lib/qr-designs";

describe("Start building QR codes", () => {
  it.each(QR_DESIGNS)(
    "decodes the $name design to its tracked URL",
    (design) => {
      const expected = scanUrl("https://booth-wall.vercel.app", design.key);
      const pixels = renderQrPixels(createQrMatrix(expected), 10);
      const decoded = jsQR(pixels.data, pixels.width, pixels.height, {
        inversionAttempts: "dontInvert",
      });

      expect(decoded?.data).toBe(expected);
      expect(pixels.data.slice(0, 4)).toEqual(
        new Uint8ClampedArray([255, 255, 255, 255]),
      );
    },
  );
});
