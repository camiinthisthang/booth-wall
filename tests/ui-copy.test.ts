import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(target);
      return /\.(tsx?|css)$/.test(entry.name) ? [target] : [];
    }),
  );
  return nested.flat();
}

describe("UI copy", () => {
  it("does not contain em dash characters", async () => {
    const files = [
      ...(await sourceFiles(path.resolve("app"))),
      ...(await sourceFiles(path.resolve("features"))),
    ];
    const offenders: string[] = [];
    for (const file of files) {
      if ((await readFile(file, "utf8")).includes("\u2014")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
