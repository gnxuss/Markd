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
  it("allows only Quick Save creation and explicit Library movement", async () => {
    const files = await typeScriptFiles("src");
    const sources = await Promise.all(files.map(async (file) => [file, await readFile(file, "utf8")] as const));
    const mutations = sources.flatMap(([file, source]) => Array.from(
      source.matchAll(/chrome\.bookmarks\.(create|update|move|remove|removeTree)\s*\(/g),
      ([, method]) => ({ file, method }),
    )).sort((left, right) => `${left.file}:${left.method}`.localeCompare(`${right.file}:${right.method}`));

    expect(mutations).toEqual([
      { file: "src/library/main.ts", method: "move" },
      { file: "src/quick-save/main.ts", method: "create" },
    ]);
  });

  it("ships exactly bookmarks, storage, and active-tab authority", async () => {
    const sourceManifest: unknown = JSON.parse(await readFile("manifest.json", "utf8"));
    const emittedManifest: unknown = JSON.parse(await readFile("dist/manifest.json", "utf8"));

    for (const manifest of [sourceManifest, emittedManifest]) {
      expect(manifest).toMatchObject({ permissions: ["bookmarks", "storage", "activeTab"] });
      expect(manifest).not.toHaveProperty("host_permissions");
      expect(manifest).not.toHaveProperty("content_scripts");
    }
  });
});
