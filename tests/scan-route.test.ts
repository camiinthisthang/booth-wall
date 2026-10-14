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

  it("counts an allowlisted design and redirects with campaign parameters", async () => {
    const response = await GET(new Request("https://booth.example/go/terrain"), {
      params: Promise.resolve({ design: "terrain" }),
    });

    expect(recordScan).toHaveBeenCalledWith("terrain", expect.any(Number));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.factory.ai/?utm_source=booth&utm_content=terrain",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects unknown designs without touching the counter", async () => {
    const response = await GET(
      new Request("https://booth.example/go/not-a-design"),
      { params: Promise.resolve({ design: "not-a-design" }) },
    );

    expect(response.status).toBe(404);
    expect(recordScan).not.toHaveBeenCalled();
  });
});
