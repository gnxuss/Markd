import { cp, mkdir, readFile, rm } from "node:fs/promises";

import { build } from "esbuild";

const forbiddenManifestKeys = ["content_scripts", "host_permissions", "optional_host_permissions"];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const expectedCommands = {
  "_execute_action": {
    suggested_key: { default: "Ctrl+Shift+Period", mac: "Command+Shift+Period" },
    description: "Open Quick Save",
  },
  "open-library": {
    suggested_key: { default: "Ctrl+Shift+L", mac: "Command+Shift+L" },
    description: "Open Markd library",
  },
};

async function auditManifest(path) {
  const manifest = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(manifest)) {
    throw new TypeError(`${path} must contain a JSON object`);
  }
  if (
    manifest["manifest_version"] !== 3 ||
    manifest["minimum_chrome_version"] !== "90" ||
    JSON.stringify(manifest["permissions"]) !== JSON.stringify(["bookmarks", "storage", "activeTab"])
  ) {
    throw new TypeError(`${path} must use MV3, Chrome 90, and exactly the bookmarks, storage, and activeTab permissions`);
  }
  if (
    !isRecord(manifest["action"]) ||
    manifest["action"]["default_popup"] !== "quick-save.html" ||
    JSON.stringify(manifest["commands"]) !== JSON.stringify(expectedCommands)
  ) {
    throw new TypeError(`${path} must package the exact Quick Save action and two intended commands`);
  }
  for (const key of forbiddenManifestKeys) {
    if (key in manifest) {
      throw new TypeError(`${path} must not declare ${key}`);
    }
  }
  console.log(`Manifest audit passed: ${path}`);
}

await auditManifest("manifest.json");

if (!process.argv.includes("--check")) {
  await rm("dist", { force: true, recursive: true });
  await mkdir("dist", { recursive: true });
  await build({
    bundle: true,
    entryPoints: {
      background: "src/background.ts",
      library: "src/library/main.ts",
      "quick-save": "src/quick-save/main.ts",
    },
    format: "esm",
    outdir: "dist",
    platform: "browser",
    target: "chrome90",
  });
  await Promise.all([
    cp("manifest.json", "dist/manifest.json"),
    cp("src/library/index.html", "dist/library.html"),
    cp("src/library/styles.css", "dist/library.css"),
    cp("src/quick-save/index.html", "dist/quick-save.html"),
    cp("src/quick-save/styles.css", "dist/quick-save.css"),
  ]);
  await auditManifest("dist/manifest.json");
}
