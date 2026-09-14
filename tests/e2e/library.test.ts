import { afterEach, describe, expect, it } from "vitest";

import {
  launchExtension,
  openSeededBookmark,
  type BookmarkGesture,
  type ExtensionFixture,
  type SeedNode,
} from "./fixtures.js";

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
  await fixture?.close();
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
    expect(await row?.$eval(".bookmark-url", (element) => element.textContent)).toBe("nested.example/a/very/long/…");
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
  it("requests exactly the current local-only browser authority", async () => {
    fixture = await launchExtension([]);
    const manifest: unknown = await fixture.worker.evaluate(async () => {
      const response = await fetch(chrome.runtime.getURL("manifest.json"));
      return response.json();
    });
    expect(manifest).toEqual({
      manifest_version: 3,
      name: "Markd",
      version: "0.1.0",
      minimum_chrome_version: "90",
      permissions: ["bookmarks", "storage", "activeTab"],
      action: { default_title: "Quick Save with Markd", default_popup: "quick-save.html" },
      commands: {
        "_execute_action": {
          suggested_key: { default: "Ctrl+Shift+Period", mac: "Command+Shift+Period" },
          description: "Open Quick Save",
        },
        "open-library": {
          suggested_key: { default: "Ctrl+Shift+L", mac: "Command+Shift+L" },
          description: "Open Markd library",
        },
      },
      background: { service_worker: "background.js", type: "module" },
    });
  });
});

describe("bookmark-open built Chromium", () => {
  it.each([
    ["ordinary primary", "primary", "hidden"],
    ["platform modifier primary", "modifier-primary", "visible"],
    ["middle", "middle", "visible"],
  ] as const)("opens exactly one %s tab with native disposition", async (_name, gesture, libraryVisibility) => {
    const url = `https://${gesture}.example/exact-native-path`;
    fixture = await launchExtension([
      { kind: "bookmark", key: "opening-target", title: "Opening target", url },
    ]);
    const opened = await openSeededBookmark(fixture, "opening-target", gesture satisfies BookmarkGesture);
    expect(opened.matchingTargetCount).toBe(1);
    expect(opened.openedUrl).toBe(url);
    expect(opened.libraryVisibility).toBe(libraryVisibility);
    expect(opened.libraryPage.url()).toBe(fixture.libraryUrl);
    expect(opened.libraryPage.isClosed()).toBe(false);
  }, 30_000);
});
