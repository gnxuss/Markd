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
    fixture = await launchExtension(largeLibrary);

    // When: Markd reaches ready state and repeats retrieval changes.
    const page = await fixture.openLibrary();
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
    const repeatedMetrics = await page.metrics();
    const repeatedCounts = await page.evaluate(() => ({
      rows: document.querySelectorAll(".bookmark-row").length,
      elements: document.querySelectorAll("*").length,
    }));
    await page.click(".pagination-button:last-child");
    const secondPageFirstId = await page.$eval(
      ".bookmark-row",
      (element) => element.getAttribute("data-bookmark-id"),
    );
    console.info("MARKD_PERF_BASELINE", JSON.stringify({
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
    expect(secondPageFirstId).toBe(fixture.bookmarks["bookmark-100"]?.id);
    await page.type("#bookmark-search", "Performance bookmark 1999");
    const lastId = fixture.bookmarks["bookmark-1999"]?.id;
    expect(await page.$(`[data-bookmark-id="${lastId}"]`)).not.toBeNull();
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
