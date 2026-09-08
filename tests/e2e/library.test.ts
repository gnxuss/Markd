import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { launchExtension, type ExtensionFixture, type SeedNode } from "./fixtures.js";

const duplicateUrl = "https://duplicate.example/native";
const libraryNodes = [
  { kind: "bookmark", key: "adjacent-first", title: "Adjacent first", url: "https://first.example/root" },
  { kind: "folder", title: "Empty folder must not render", children: [] },
  {
    kind: "folder",
    title: "Nested folder must not render",
    children: [
      { kind: "bookmark", key: "nested", title: "", url: "https://www.nested.example/a/very/long/path" },
      { kind: "bookmark", key: "duplicate-one", title: "Duplicate one", url: duplicateUrl },
    ],
  },
  { kind: "bookmark", key: "adjacent-last", title: "Adjacent last", url: "https://last.example/root" },
  { kind: "bookmark", key: "duplicate-two", title: "Duplicate two", url: duplicateUrl },
] as const satisfies readonly SeedNode[];

let fixture: ExtensionFixture | undefined;

afterEach(async () => {
  await fixture?.browser.close();
  fixture = undefined;
});

describe("library-load built Chromium", () => {
  it("renders pre-existing bookmarks in exact depth-first order without folders", async () => {
    fixture = await launchExtension(libraryNodes);
    const page = await fixture.openLibrary();
    await page.waitForSelector(".bookmark-row");
    const rows = await page.$$eval(".bookmark-row", (elements) =>
      elements.map((element) => ({ id: element.getAttribute("data-bookmark-id"), text: element.textContent })),
    );
    const keys = ["adjacent-first", "nested", "duplicate-one", "adjacent-last", "duplicate-two"] as const;
    expect(rows.map(({ id }) => id)).toEqual(keys.map((key) => fixture?.bookmarks[key]?.id));
    expect(rows.map(({ text }) => text)).not.toContain(expect.stringContaining("folder must not render"));
  }, 30_000);

  it("shows title fallback, display URL, and an empty tag lane", async () => {
    fixture = await launchExtension(libraryNodes);
    const page = await fixture.openLibrary();
    const nestedId = fixture.bookmarks["nested"]?.id;
    const row = await page.waitForSelector(`[data-bookmark-id="${nestedId}"]`);
    expect(await row?.$eval(".bookmark-title", (element) => element.textContent)).toBe("Untitled bookmark");
    expect(await row?.$eval(".bookmark-url", (element) => element.textContent)).toBe("nested.example/a/very/long/path");
    expect(await row?.$eval(".bookmark-tags", (element) => element.textContent)).toBe("");
  }, 30_000);
});

describe("duplicate-urls built Chromium", () => {
  it("keeps equal URLs as separate native identities in original positions", async () => {
    fixture = await launchExtension(libraryNodes);
    const page = await fixture.openLibrary();
    await page.waitForSelector(".bookmark-row");
    const duplicateRows = await page.$$eval(`a[href="${duplicateUrl}"]`, (links) =>
      links.map((link) => link.closest(".bookmark-row")?.getAttribute("data-bookmark-id")),
    );
    expect(duplicateRows).toEqual([
      fixture.bookmarks["duplicate-one"]?.id,
      fixture.bookmarks["duplicate-two"]?.id,
    ]);
    expect(new Set(duplicateRows).size).toBe(2);
  }, 30_000);
});

describe("empty-library built Chromium", () => {
  it("shows the empty state when the profile contains only folders", async () => {
    fixture = await launchExtension([{ kind: "folder", title: "Only folder", children: [] }]);
    const page = await fixture.openLibrary();
    await page.waitForFunction(() => document.querySelector("#status")?.textContent === "No bookmarks found.");
    expect(await page.$$(".bookmark-row")).toHaveLength(0);
  }, 30_000);
});

describe("permission-audit emitted package", () => {
  it("requests exactly the Phase 1 browser authority", async () => {
    const manifest: unknown = JSON.parse(await readFile(new URL("../../dist/manifest.json", import.meta.url), "utf8"));
    expect(manifest).toEqual({
      manifest_version: 3,
      name: "Markd",
      version: "0.1.0",
      minimum_chrome_version: "90",
      permissions: ["bookmarks"],
      action: { default_title: "Open Markd" },
      background: { service_worker: "background.js", type: "module" },
    });
  });
});
