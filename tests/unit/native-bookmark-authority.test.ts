import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

async function typeScriptFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry): Promise<readonly string[]> => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typeScriptFiles(path);
    return extname(entry.name) === ".ts" ? [path] : [];
  }));
  return nested.flat();
}

describe("native bookmark authority", () => {
  it("keeps every production bookmark API call read or observe only", async () => {
    const files = await typeScriptFiles("src");
    const sources = await Promise.all(files.map(async (file) => [file, await readFile(file, "utf8")] as const));
    const forbidden = /chrome\.bookmarks\.(?:create|update|move|remove|removeTree)\s*\(/;

    expect(sources.filter(([, source]) => forbidden.test(source)).map(([file]) => file)).toEqual([]);
  });

  it("ships exactly bookmarks and storage authority", async () => {
    const sourceManifest: unknown = JSON.parse(await readFile("manifest.json", "utf8"));
    const emittedManifest: unknown = JSON.parse(await readFile("dist/manifest.json", "utf8"));

    for (const manifest of [sourceManifest, emittedManifest]) {
      expect(manifest).toMatchObject({ permissions: ["bookmarks", "storage"] });
      expect(manifest).not.toHaveProperty("host_permissions");
      expect(manifest).not.toHaveProperty("content_scripts");
    }
  });
});
