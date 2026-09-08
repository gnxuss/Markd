import { cp, mkdir, rm } from "node:fs/promises";

import { build } from "esbuild";

await rm("dist", { force: true, recursive: true });
await mkdir("dist", { recursive: true });

await build({
  bundle: true,
  entryPoints: {
    background: "src/background.ts",
    library: "src/library/main.ts",
  },
  format: "esm",
  outdir: "dist",
  platform: "browser",
  target: "chrome90",
});

await Promise.all([
  cp("manifest.json", "dist/manifest.json"),
  cp("src/library/index.html", "dist/library.html"),
]);
