import { afterEach, describe, expect, it } from "vitest";

import { launchExtension, type ExtensionFixture, type SeedNode } from "./fixtures.js";

const bookmarkCount = 2_000;
const largeLibrary = Array.from({ length: bookmarkCount }, (_, index) => ({
  kind: "bookmark",
  key: `bookmark-${index}`,
  title: `Performance bookmark ${String(index).padStart(4, "0")}`,
  url: `https://performance.example/bookmark/${index}`,
})) satisfies readonly SeedNode[];

let fixture: ExtensionFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

describe("large-library built Chromium", () => {
  it("keeps the live bookmark DOM bounded while every result remains reachable", async () => {
    // Given: a disposable Chromium profile with 2,000 native bookmarks.
    fixture = await launchExtension(largeLibrary, true);

    // When: Markd reaches ready state and repeats retrieval changes.
    const page = await fixture.openLibrary();
    const cdp = await page.createCDPSession();
    await cdp.send("HeapProfiler.collectGarbage");
    const initialMetrics = await page.metrics();
    const initialCounts = await page.evaluate(() => ({
      rows: document.querySelectorAll(".bookmark-row").length,
      elements: document.querySelectorAll("*").length,
    }));
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
    await page.type("#bookmark-search", "Performance bookmark 1999");
    const lastId = fixture.bookmarks["bookmark-1999"]?.id;
    expect(await page.$(`[data-bookmark-id="${lastId}"]`)).not.toBeNull();
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
      pageTargets: fixture.browser.targets().filter((target) => target.type() === "page").length,
    }));

    // Then: the live row count is capped and an off-page row can be retrieved.
    expect(initialCounts.rows).toBeLessThanOrEqual(100);
    expect(repeatedCounts.rows).toBeLessThanOrEqual(100);
    expect(repeatedCounts.elements).toBeLessThan(1_000);
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
