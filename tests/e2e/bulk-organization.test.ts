import { afterEach, describe, expect, it, vi } from "vitest";

import { launchExtension, type ExtensionFixture, type SeedNode } from "./fixtures.js";

let fixture: ExtensionFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

describe("bulk organization built Chromium", () => {
  it("adds and removes tags for exact selections retained across pages", async () => {
    const nodes = Array.from({ length: 102 }, (_, index) => ({
      kind: "bookmark",
      key: `bookmark-${index}`,
      title: `Bulk bookmark ${index}`,
      url: index === 0 || index === 101
        ? "https://duplicate.example/shared"
        : `https://bulk.example/${index}`,
    })) satisfies readonly SeedNode[];
    fixture = await launchExtension(nodes);
    const firstId = fixture.bookmarks["bookmark-0"]?.id;
    const lastId = fixture.bookmarks["bookmark-101"]?.id;
    if (firstId === undefined || lastId === undefined) throw new TypeError("Bulk seed IDs unavailable");
    const page = await fixture.openLibrary();
    const checkbox = (id: string): string => `[data-bookmark-id="${id}"] .bookmark-selection input`;

    await page.click(".selection-mode-toggle");
    expect(await page.$$(".bookmark-selection input")).toHaveLength(100);
    await page.click(checkbox(firstId));
    await page.click(".pagination-button:last-child");
    expect(await page.$$(".bookmark-selection input")).toHaveLength(2);
    await page.click(checkbox(lastId));
    expect(await page.$eval(".selection-count", (element) => element.textContent)).toBe("2 selected");

    for (const label of ["Design", "Reference"] as const) {
      await page.type(".bulk-tag-input", label);
      await page.keyboard.press("Enter");
    }
    await page.click(".bulk-add");
    await page.waitForFunction(() => document.querySelector(".bulk-status")?.textContent === "Tags updated.");
    await vi.waitFor(async () => {
      const stored = await fixture?.worker.evaluate(async (ids) => chrome.storage.local.get(
        ids.map((id) => `bookmark-tags:1:${id}`),
      ), [firstId, lastId]);
      expect(stored?.[`bookmark-tags:1:${firstId}`]).toEqual({ version: 1, tags: [
        { key: "design", label: "Design" }, { key: "reference", label: "Reference" },
      ] });
      expect(stored?.[`bookmark-tags:1:${lastId}`]).toEqual(stored?.[`bookmark-tags:1:${firstId}`]);
    });
    expect(await page.$$(`[data-bookmark-id="${lastId}"] .tag-chip`)).toHaveLength(2);

    await page.click(checkbox(lastId));
    await page.click(".pagination-button:first-child");
    await page.click(checkbox(firstId));
    await page.type(".bulk-tag-input", "Design");
    await page.keyboard.press("Enter");
    await page.click(".bulk-remove");
    await page.waitForFunction(() => document.querySelector(".bulk-status")?.textContent === "Tags updated.");
    const stored = await fixture.worker.evaluate(async (ids) => chrome.storage.local.get(
      ids.map((id) => `bookmark-tags:1:${id}`),
    ), [firstId, lastId]);
    expect(stored[`bookmark-tags:1:${firstId}`]).toEqual({ version: 1, tags: [
      { key: "reference", label: "Reference" },
    ] });
    expect(stored[`bookmark-tags:1:${lastId}`]).toEqual(stored[`bookmark-tags:1:${firstId}`]);
    const native = await fixture.worker.evaluate(async (ids) => Promise.all(ids.map((id) => chrome.bookmarks.get(id))), [firstId, lastId]);
    expect(native.map((nodesForId) => nodesForId[0]?.url)).toEqual([
      "https://duplicate.example/shared",
      "https://duplicate.example/shared",
    ]);
  }, 120_000);

  it("keeps ordinary row interactions intact outside selection mode", async () => {
    fixture = await launchExtension([
      { kind: "bookmark", key: "target", title: "Bulk target", url: "https://bulk.example/target" },
    ]);
    const id = fixture.bookmarks["target"]?.id;
    if (id === undefined) throw new TypeError("Bulk target unavailable");
    const page = await fixture.openLibrary();
    const row = `[data-bookmark-id="${id}"]`;

    expect(await page.$(`${row} .bookmark-selection`)).toBeNull();
    await page.$eval(row, (element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(await page.$(`${row} .bookmark-note`)).not.toBeNull();
    await page.click(".selection-mode-toggle");
    await page.click(`${row} .bookmark-selection input`);
    expect(await page.$(`${row} .bookmark-note`)).not.toBeNull();
    await page.click(".selection-mode-toggle");
    expect(await page.$(`${row} .bookmark-selection`)).toBeNull();
  }, 30_000);
});
