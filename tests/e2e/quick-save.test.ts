import { afterEach, describe, expect, it, vi } from "vitest";

import { launchExtension, type ExtensionFixture } from "./fixtures.js";
import type { Page } from "puppeteer";

let fixture: ExtensionFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function openQuickSave(activePage: Page): Promise<Page> {
  if (fixture === undefined) throw new TypeError("Fixture unavailable");
  const extension = [...(await fixture.browser.extensions()).values()].find((candidate) => candidate.name === "Markd");
  if (extension === undefined) throw new TypeError("The built Markd extension was not loaded");
  const popupTarget = fixture.browser.waitForTarget((target) => target.url().endsWith("/quick-save.html"));
  await extension.triggerAction(activePage);
  const popup = await (await popupTarget).asPage();
  await popup.waitForSelector("#tag-input");
  return popup;
}

async function openTestPage(url: string, title: string): Promise<Page> {
  if (fixture === undefined) throw new TypeError("Fixture unavailable");
  const page = await fixture.browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    void request.respond({ status: 200, contentType: "text/html", body: `<title>${title}</title>` });
  });
  await page.goto(url);
  return page;
}

describe("Quick Save built Chromium", () => {
  it("saves a new active page into a native folder with an exact-ID tag", async () => {
    // Given: a normal active page and an isolated profile with a nested native folder.
    fixture = await launchExtension([{ kind: "folder", title: "Research", children: [] }]);
    const activePage = await fixture.browser.newPage();
    await activePage.setRequestInterception(true);
    activePage.on("request", (request) => {
      void request.respond({ status: 200, contentType: "text/html", body: "<title>Fresh article</title><h1>Fresh article</h1>" });
    });
    await activePage.goto("https://fresh.example/article");
    const extension = [...(await fixture.browser.extensions()).values()].find((candidate) => candidate.name === "Markd");
    if (extension === undefined) throw new TypeError("The built Markd extension was not loaded");

    // When: the real toolbar action opens and the form is completed by keyboard.
    const popupTarget = fixture.browser.waitForTarget((target) => target.url().endsWith("/quick-save.html"));
    await extension.triggerAction(activePage);
    const popup = await (await popupTarget).asPage();
    await popup.waitForSelector("#tag-input:not([disabled])");
    expect(await popup.$eval("#page-title", (element) => element.textContent)).toBe("Fresh article");
    expect(await popup.$eval("#tag-input", (element) => element === document.activeElement)).toBe(true);
    await popup.select("#folder", await popup.$eval("#folder option:last-child", (option) => option.value));
    await popup.type("#tag-input", "  Design  ");
    await popup.keyboard.press("Enter");
    await popup.type("#tag-input", "Research");
    await popup.keyboard.press("Enter");
    await popup.type("#note", "Worth revisiting");
    await popup.keyboard.down("Control");
    await popup.keyboard.press("Enter");
    await popup.keyboard.up("Control");
    await popup.waitForFunction(() => document.querySelector("#status")?.textContent === "Saved.");

    // Then: one native bookmark and its canonical metadata exist under the returned ID.
    const result = await fixture.worker.evaluate(async () => {
      const nodes = await chrome.bookmarks.search({ url: "https://fresh.example/article" });
      const bookmark = nodes[0];
      return {
        count: nodes.length,
        id: bookmark?.id,
        parentId: bookmark?.parentId,
        stored: bookmark === undefined ? {} : await chrome.storage.local.get([
          `bookmark-tags:1:${bookmark.id}`, `bookmark-note:1:${bookmark.id}`,
        ]),
      };
    });
    expect(result.count).toBe(1);
    expect(result.stored[`bookmark-tags:1:${result.id}`]).toEqual({
      version: 1, tags: [{ key: "design", label: "Design" }, { key: "research", label: "Research" }],
    });
    expect(result.stored[`bookmark-note:1:${result.id}`]).toEqual({ version: 1, note: "Worth revisiting" });
  }, 30_000);

  it("updates an already-bookmarked page through the complete keyboard workflow", async () => {
    // Given: one exact native bookmark with existing metadata and recent tags.
    const pageUrl = "https://existing.example/article";
    fixture = await launchExtension([{ kind: "bookmark", key: "target", title: "Existing article", url: pageUrl }]);
    const targetId = fixture.bookmarks["target"]?.id;
    await fixture.worker.evaluate(async (id) => chrome.storage.local.set({
      [`bookmark-tags:1:${id}`]: { version: 1, tags: [{ key: "old", label: "Old" }] },
      [`bookmark-note:1:${id}`]: { version: 1, note: "Original note" },
      "recent-tags:1": { version: 1, tags: [{ key: "design", label: "Design" }] },
    }), targetId);
    const activePage = await openTestPage(pageUrl, "Existing article");

    // When: tags and note are edited and Ctrl+Enter submits without a mouse.
    const popup = await openQuickSave(activePage);
    expect(await popup.$eval("#bookmark-state", (element) => element.textContent)).toContain("Already bookmarked");
    expect(await popup.$eval("#save", (element) => element.textContent)).toBe("Update");
    await popup.click('[aria-label="Remove Old"]');
    await popup.type("#tag-input", "des");
    await popup.keyboard.press("ArrowDown");
    await popup.keyboard.press("ArrowUp");
    await popup.keyboard.press("Enter");
    await popup.click("#note", { count: 3 });
    await popup.type("#note", "Updated note");
    await popup.keyboard.down("Control");
    await popup.keyboard.press("Enter");
    await popup.keyboard.up("Control");
    await popup.waitForFunction(() => document.querySelector("#status")?.textContent === "Updated.");

    // Then: exact-ID Markd metadata changes while the native bookmark remains singular.
    const result = await fixture.worker.evaluate(async ({ id, url }) => ({
      nodes: await chrome.bookmarks.search({ url }),
      stored: await chrome.storage.local.get([`bookmark-tags:1:${id}`, `bookmark-note:1:${id}`, "recent-tags:1"]),
    }), { id: targetId, url: pageUrl });
    expect(result.nodes).toHaveLength(1);
    expect(result.stored[`bookmark-tags:1:${targetId}`]).toEqual({ version: 1, tags: [{ key: "design", label: "Design" }] });
    expect(result.stored[`bookmark-note:1:${targetId}`]).toEqual({ version: 1, note: "Updated note" });
  }, 30_000);

  it("keeps intentional duplicate URLs independent when Quick Save updates", async () => {
    // Given: two equal native URLs with different exact-ID metadata.
    const pageUrl = "https://duplicate.example/same";
    fixture = await launchExtension([
      { kind: "folder", title: "First folder", children: [{ kind: "bookmark", key: "first", title: "First", url: pageUrl }] },
      { kind: "folder", title: "Second folder", children: [{ kind: "bookmark", key: "second", title: "Second", url: pageUrl }] },
    ]);
    const firstId = fixture.bookmarks["first"]?.id;
    const secondId = fixture.bookmarks["second"]?.id;
    await fixture.worker.evaluate(async ({ first, second }) => chrome.storage.local.set({
      [`bookmark-tags:1:${first}`]: { version: 1, tags: [{ key: "first", label: "First" }] },
      [`bookmark-tags:1:${second}`]: { version: 1, tags: [{ key: "second", label: "Second" }] },
    }), { first: firstId, second: secondId });
    const activePage = await openTestPage(pageUrl, "Duplicate article");

    // When: the disclosed first depth-first match is updated.
    const popup = await openQuickSave(activePage);
    expect(await popup.$eval("#bookmark-state", (element) => element.textContent)).toContain("first of 2 matches");
    await popup.type("#tag-input", "Added");
    await popup.keyboard.press("Enter");
    await popup.click("#save");
    await popup.waitForFunction(() => document.querySelector("#status")?.textContent === "Updated.");

    // Then: the sibling duplicate and native structure are untouched.
    const stored = await fixture.worker.evaluate(async ({ first, second }) => chrome.storage.local.get([
      `bookmark-tags:1:${first}`, `bookmark-tags:1:${second}`,
    ]), { first: firstId, second: secondId });
    expect(stored[`bookmark-tags:1:${firstId}`]).toEqual({ version: 1, tags: [
      { key: "first", label: "First" }, { key: "added", label: "Added" },
    ] });
    expect(stored[`bookmark-tags:1:${secondId}`]).toEqual({ version: 1, tags: [{ key: "second", label: "Second" }] });
  }, 30_000);

  it("packages Quick Save and focused library entry points for the configured Chromium commands", async () => {
    // Given: the built manifest and a normal active page in an isolated profile.
    fixture = await launchExtension([]);
    const activePage = await openTestPage("https://commands.example/article", "Command article");
    const manifest = await fixture.worker.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.permissions).toEqual(["bookmarks", "storage", "activeTab"]);
    expect(manifest.commands).toEqual({
      "_execute_action": {
        suggested_key: { default: "Ctrl+Shift+Period", mac: "Command+Shift+Period" },
        description: "Open Quick Save",
      },
      "open-library": {
        suggested_key: { default: "Ctrl+Shift+L", mac: "Command+Shift+L" },
        description: "Open Markd library",
      },
    });

    // When: the reserved action path and focused library intent load from the built extension.
    const popup = await openQuickSave(activePage);
    expect(await popup.$eval("#tag-input", (element) => element === document.activeElement)).toBe(true);
    await popup.close();
    const library = await fixture.browser.newPage();
    await library.goto(`${fixture.libraryUrl}?focus=search`);
    await library.waitForFunction(() => document.querySelector("#status")?.textContent !== "Loading bookmarks…");

    // Then: the packaged library owns focus without content-page interception.
    expect(await library.$eval("#bookmark-search", (element) => element === document.activeElement)).toBe(true);
  }, 30_000);

  it("cleans removed bookmark tag and note keys while preserving duplicate and recent metadata", async () => {
    // Given: equal native URLs with independent metadata and a global recent list.
    const pageUrl = "https://cleanup.example/same";
    fixture = await launchExtension([
      { kind: "bookmark", key: "removed", title: "Removed", url: pageUrl },
      { kind: "bookmark", key: "survivor", title: "Survivor", url: pageUrl },
    ], true);
    const removedId = fixture.bookmarks["removed"]?.id;
    const survivorId = fixture.bookmarks["survivor"]?.id;
    await fixture.worker.evaluate(async ({ removed, survivor }) => chrome.storage.local.set({
      [`bookmark-tags:1:${removed}`]: { version: 1, tags: [{ key: "remove", label: "Remove" }] },
      [`bookmark-note:1:${removed}`]: { version: 1, note: "remove" },
      [`bookmark-tags:1:${survivor}`]: { version: 1, tags: [{ key: "keep", label: "Keep" }] },
      [`bookmark-note:1:${survivor}`]: { version: 1, note: "keep" },
      "recent-tags:1": { version: 1, tags: [{ key: "keep", label: "Keep" }] },
    }), { removed: removedId, survivor: survivorId });

    // When: Chromium removes one exact native bookmark.
    await fixture.native.remove(removedId ?? "");
    await vi.waitFor(async () => {
      const stored = await fixture?.worker.evaluate(async () => chrome.storage.local.get(null));
      expect(stored).not.toHaveProperty(`bookmark-note:1:${removedId}`);
      expect(stored).not.toHaveProperty(`bookmark-tags:1:${removedId}`);
    });

    // Then: equal-URL sibling metadata and global recency survive.
    const stored = await fixture.worker.evaluate(async () => chrome.storage.local.get(null));
    expect(stored).toHaveProperty(`bookmark-tags:1:${survivorId}`);
    expect(stored).toHaveProperty(`bookmark-note:1:${survivorId}`);
    expect(stored).toHaveProperty("recent-tags:1");
  }, 30_000);

  it("shows a non-mutating error for a browser-owned active page", async () => {
    // Given: a browser page that Chromium cannot bookmark.
    fixture = await launchExtension([]);
    const activePage = await fixture.browser.newPage();
    await activePage.goto("chrome://version");

    // When: the built toolbar popup initializes.
    const popup = await openQuickSave(activePage);
    await popup.waitForFunction(() => document.querySelector("#status")?.textContent === "This page cannot be bookmarked.");

    // Then: mutation controls are unavailable and no native bookmark exists.
    expect(await popup.$eval("#content", (element) => element instanceof HTMLElement && element.hidden)).toBe(true);
    expect(await fixture.worker.evaluate(async () => chrome.bookmarks.search({ url: "chrome://version" }))).toEqual([]);
  }, 30_000);
});
