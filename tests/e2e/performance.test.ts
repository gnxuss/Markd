import { afterEach, describe, expect, it } from "vitest";

import { launchExtension, type ExtensionFixture, type SeedNode } from "./fixtures.js";

const bookmarkCount = 2_000;
const largeLibrary = [
  ...Array.from({ length: bookmarkCount - 1 }, (_, index) => ({
    kind: "bookmark" as const,
    key: `bookmark-${index}`,
    title: `Performance bookmark ${String(index).padStart(4, "0")}`,
    url: `https://performance.example/bookmark/${index}`,
  })),
  { kind: "folder", title: "Deep archive", children: [
    { kind: "folder", title: "Needle shelf", children: [
      {
        kind: "bookmark",
        key: "bookmark-1999",
        title: "Performance bookmark 1999",
        url: "https://performance.example/bookmark/1999",
      },
    ] },
  ] },
] satisfies readonly SeedNode[];

let fixture: ExtensionFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

describe("large-library built Chromium", () => {
  it("keeps the live bookmark DOM bounded while every result remains reachable", async () => {
    // Given: a disposable Chromium profile with 2,000 native bookmarks.
    fixture = await launchExtension(largeLibrary, true);
    const lastId = fixture.bookmarks["bookmark-1999"]?.id;
    if (lastId === undefined) throw new TypeError("Off-page performance seed unavailable");
    await fixture.worker.evaluate(async (id) => chrome.storage.local.set({
      [`bookmark-note:1:${id}`]: { version: 1, note: "Rare memory phrase" },
    }), lastId);

    // When: Markd reaches ready state and repeats retrieval changes.
    const page = await fixture.openLibrary();
    const cdp = await page.createCDPSession();
    await cdp.send("HeapProfiler.collectGarbage");
    const initialMetrics = await page.metrics();
    const initialCounts = await page.evaluate(() => ({
      rows: document.querySelectorAll(".bookmark-row").length,
      elements: document.querySelectorAll("*").length,
    }));
    await page.evaluate(() => {
      const root = document.documentElement;
      root.dataset["bookmarkReads"] = "0";
      root.dataset["storageReads"] = "0";
      chrome.bookmarks.getTree = new Proxy(chrome.bookmarks.getTree, {
        apply: (target, thisArgument, argumentsList) => {
          root.dataset["bookmarkReads"] = String(Number(root.dataset["bookmarkReads"] ?? "0") + 1);
          return Reflect.apply(target, thisArgument, argumentsList);
        },
      });
      chrome.storage.local.get = new Proxy(chrome.storage.local.get, {
        apply: (target, thisArgument, argumentsList) => {
          root.dataset["storageReads"] = String(Number(root.dataset["storageReads"] ?? "0") + 1);
          return Reflect.apply(target, thisArgument, argumentsList);
        },
      });
    });
    for (let cycle = 0; cycle < 5; cycle += 1) {
      await page.type("#bookmark-search", "missing");
      await page.click("#bookmark-search", { count: 3 });
      await page.keyboard.press("Backspace");
    }
    for (let pageIndex = 1; pageIndex < 20; pageIndex += 1) {
      await page.click(".pagination-button:last-child");
    }
    const lastPageFirstId = await page.$eval(
      ".bookmark-row",
      (element) => element.getAttribute("data-bookmark-id"),
    );
    await page.type("#bookmark-search", "rare memory phrase");
    expect(await page.$(`[data-bookmark-id="${lastId}"]`)).not.toBeNull();
    await page.click("#bookmark-search", { count: 3 });
    await page.type("#bookmark-search", "needle shelf");
    expect(await page.$(`[data-bookmark-id="${lastId}"]`)).not.toBeNull();
    expect(await page.evaluate(() => ({
      bookmarks: document.documentElement.dataset["bookmarkReads"],
      storage: document.documentElement.dataset["storageReads"],
    }))).toEqual({ bookmarks: "0", storage: "0" });
    await page.click("#bookmark-search", { count: 3 });
    await page.keyboard.press("Backspace");
    const firstId = fixture.bookmarks["bookmark-0"]?.id;
    const secondId = fixture.bookmarks["bookmark-1"]?.id;
    if (firstId === undefined || secondId === undefined) throw new TypeError("Performance seed IDs unavailable");
    const firstRow = `[data-bookmark-id="${firstId}"]`;
    await page.type(`${firstRow} .tag-input`, "Performance");
    await page.keyboard.press("Enter");
    await page.waitForSelector(`${firstRow} .tag-chip`);
    await page.click("#untagged-view");
    expect(await page.$(firstRow)).toBeNull();
    await page.click("#all-view");
    await page.click('[data-tag-key="performance"]');
    expect(await page.$(firstRow)).not.toBeNull();
    await page.click(`${firstRow} [aria-label="Remove Performance"]`);
    await page.waitForFunction(() => document.querySelector('[data-tag-key="performance"]') === null);
    await page.click(".selection-mode-toggle");
    await page.click(`${firstRow} .bookmark-selection input`);
    for (let pageIndex = 1; pageIndex < 20; pageIndex += 1) {
      await page.click(".pagination-button:last-child");
    }
    await page.click(`[data-bookmark-id="${lastId}"] .bookmark-selection input`);
    expect(await page.$eval(".selection-count", (element) => element.textContent)).toBe("2 selected");
    const selectionCounts = await page.evaluate(() => ({
      rows: document.querySelectorAll(".bookmark-row").length,
      checkboxes: document.querySelectorAll(".bookmark-selection input").length,
      elements: document.querySelectorAll("*").length,
    }));
    await page.type(".bulk-tag-input", "Bulk performance");
    await page.keyboard.press("Enter");
    await page.click(".bulk-add");
    await page.waitForFunction(() => document.querySelector(".bulk-status")?.textContent === "Tags updated.");
    await page.click(".selection-mode-toggle");
    for (let pageIndex = 19; pageIndex > 0; pageIndex -= 1) {
      await page.click(".pagination-button:first-child");
    }
    await fixture.native.update(firstId, { title: "Performance bookmark renamed" });
    const createdId = await fixture.native.create({
      parentId: "1",
      title: "Performance bookmark created",
      url: "https://performance.example/created",
    });
    await fixture.native.remove(secondId);
    await page.waitForFunction(
      ({ renamedId, removedId }) =>
        document.querySelector(`[data-bookmark-id="${renamedId}"]`)?.textContent?.includes("renamed") === true
        && document.querySelector(`[data-bookmark-id="${removedId}"]`) === null,
      {},
      { renamedId: firstId, removedId: secondId },
    );
    await page.type("#bookmark-search", "Performance bookmark created");
    expect(await page.$(`[data-bookmark-id="${createdId}"]`)).not.toBeNull();
    await page.click("#bookmark-search", { count: 3 });
    await page.keyboard.press("Backspace");
    const openedTarget = fixture.browser.waitForTarget(
      (target) => target.url() === "https://performance.example/bookmark/0",
    );
    await page.click(`${firstRow} .bookmark-link`, { button: "middle" });
    const openedPage = await (await openedTarget).page();
    await openedPage?.close();
    await cdp.send("HeapProfiler.collectGarbage");
    const repeatedMetrics = await page.metrics();
    const repeatedCounts = await page.evaluate(() => ({
      rows: document.querySelectorAll(".bookmark-row").length,
      elements: document.querySelectorAll("*").length,
    }));
    console.info("MARKD_PERF_OPTIMIZED", JSON.stringify({
      bookmarkCount,
      initial: {
        nodes: initialMetrics.Nodes,
        heapBytes: initialMetrics.JSHeapUsedSize,
        ...initialCounts,
      },
      repeated: {
        nodes: repeatedMetrics.Nodes,
        heapBytes: repeatedMetrics.JSHeapUsedSize,
        ...repeatedCounts,
      },
      selection: selectionCounts,
      pageTargets: fixture.browser.targets().filter((target) => target.type() === "page").length,
    }));

    // Then: the live row count is capped and an off-page row can be retrieved.
    expect(initialCounts.rows).toBeLessThanOrEqual(100);
    expect(repeatedCounts.rows).toBeLessThanOrEqual(100);
    expect(repeatedCounts.elements).toBeLessThan(1_000);
    expect(selectionCounts.rows).toBeLessThanOrEqual(100);
    expect(selectionCounts.checkboxes).toBeLessThanOrEqual(100);
    expect(selectionCounts.elements).toBeLessThan(1_200);
    expect(lastPageFirstId).toBe(fixture.bookmarks["bookmark-1900"]?.id);
    const pageTarget = page.target();
    await page.close();
    await new Promise<void>((resolve) => {
      if (!fixture?.browser.targets().includes(pageTarget)) {
        resolve();
        return;
      }
      fixture.browser.once("targetdestroyed", () => resolve());
    });
    expect(fixture.browser.targets()).not.toContain(pageTarget);
  }, 300_000);
});
