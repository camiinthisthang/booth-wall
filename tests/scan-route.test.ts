import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordScan } = vi.hoisted(() => ({
  recordScan: vi.fn(),
}));

vi.mock("@/lib/scans", () => ({
  getScanStore: () => ({ recordScan }),
}));

import { GET } from "@/app/go/[design]/route";

describe("tracked QR redirect", () => {
  beforeEach(() => {
    recordScan.mockReset();
    recordScan.mockResolvedValue(1);
  });

  it.each([
    ["detected", "https://factory.com/?utm_source=booth&utm_content=detected"],
    [
      "wireframe",
      "https://factory.com/enterprise?utm_source=booth&utm_content=wireframe",
    ],
    [
      "terrain",
      "https://factory.com/contact?utm_source=booth&utm_content=terrain",
    ],
    [
      "session",
      "https://docs.factory.com/?utm_source=booth&utm_content=session",
    ],
  ] as const)(
    "counts the %s design and redirects to its Factory destination",
    async (design, destination) => {
      const response = await GET(
        new Request(`https://booth.example/go/${design}`),
        { params: Promise.resolve({ design }) },
      );

      expect(recordScan).toHaveBeenCalledWith(design, expect.any(Number));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(destination);
      expect(response.headers.get("cache-control")).toBe("no-store");
    },
  );

  it("rejects unknown designs without touching the counter", async () => {
    const response = await GET(
      new Request("https://booth.example/go/not-a-design"),
      { params: Promise.resolve({ design: "not-a-design" }) },
    );

    expect(response.status).toBe(404);
    expect(recordScan).not.toHaveBeenCalled();
  });
});
