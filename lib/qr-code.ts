import QRCode from "qrcode";

export const QR_QUIET_ZONE = 4;

export interface QrMatrix {
  size: number;
  data: Uint8Array;
}

export interface QrPixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function createQrMatrix(value: string): QrMatrix {
  const code = QRCode.create(value, { errorCorrectionLevel: "H" });
  return {
    size: code.modules.size,
    data: Uint8Array.from(code.modules.data),
  };
}

export function qrSvgPath(matrix: QrMatrix) {
  const commands: string[] = [];
  for (let row = 0; row < matrix.size; row += 1) {
    let start = -1;
    for (let column = 0; column <= matrix.size; column += 1) {
      const dark =
        column < matrix.size &&
        matrix.data[row * matrix.size + column] === 1;
      if (dark && start < 0) start = column;
      if (!dark && start >= 0) {
        commands.push(
          `M${start + QR_QUIET_ZONE} ${row + QR_QUIET_ZONE}h${column - start}v1H${start + QR_QUIET_ZONE}z`,
        );
        start = -1;
      }
    }
  }
  return commands.join("");
}

export function renderQrPixels(
  matrix: QrMatrix,
  moduleScale = 8,
): QrPixels {
  if (!Number.isInteger(moduleScale) || moduleScale < 1) {
    throw new Error("moduleScale must be a positive integer");
  }
  const modules = matrix.size + QR_QUIET_ZONE * 2;
  const width = modules * moduleScale;
  const data = new Uint8ClampedArray(width * width * 4);
  data.fill(255);

  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (matrix.data[row * matrix.size + column] !== 1) continue;
      const left = (column + QR_QUIET_ZONE) * moduleScale;
      const top = (row + QR_QUIET_ZONE) * moduleScale;
      for (let y = top; y < top + moduleScale; y += 1) {
        for (let x = left; x < left + moduleScale; x += 1) {
          const offset = (y * width + x) * 4;
          data[offset] = 8;
          data[offset + 1] = 8;
          data[offset + 2] = 8;
        }
      }
    }
  }
  return { data, width, height: width };
}
