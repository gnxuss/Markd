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

  it("keeps left selection geometry and sticky bulk controls contained", async () => {
    const nestedBookmarks = Array.from({ length: 36 }, (_, index) => ({
      kind: "bookmark",
      key: `nested-${index}`,
      title: index === 0
        ? "A deliberately long bookmark title for selection layout containment"
        : `Nested bookmark ${index}`,
      url: `https://nested.example/${index}/a-deliberately-long-url-segment`,
    })) satisfies readonly SeedNode[];
    fixture = await launchExtension([{
      kind: "folder",
      title: "Favourites Bar",
      children: [{
        kind: "folder",
        title: "A very long learning folder name that must remain contained",
        children: nestedBookmarks,
      }],
    }]);
    const page = await fixture.openLibrary();
    const normalLayout = await page.$eval("#bookmarks", (element) => ({
      maxHeight: getComputedStyle(element).maxHeight,
      overflowY: getComputedStyle(element).overflowY,
      toolbarPosition: getComputedStyle(element.querySelector(".bulk-controls") ?? element).position,
    }));
    expect(normalLayout.toolbarPosition).not.toBe("sticky");
    expect(normalLayout.overflowY).not.toBe("auto");
    expect(normalLayout.maxHeight).toBe("none");

    await page.click(".selection-mode-toggle");
    const activeLayout = await page.$eval("#bookmarks", (element) => {
      const checkboxElement = element.querySelector(".bookmark-selection input");
      const titleElement = element.querySelector(".bookmark-title");
      const toolbarElement = element.querySelector(".bulk-controls");
      const breadcrumbElement = element.querySelector(".bookmark-folder");
      if (!(checkboxElement instanceof HTMLElement)
        || !(titleElement instanceof HTMLElement)
        || !(toolbarElement instanceof HTMLElement)
        || !(breadcrumbElement instanceof HTMLElement)) {
        throw new TypeError("Selection layout was not rendered");
      }
      const checkbox = checkboxElement.getBoundingClientRect();
      const title = titleElement.getBoundingClientRect();
      const toolbar = toolbarElement.getBoundingClientRect();
      const breadcrumb = breadcrumbElement.getBoundingClientRect();
      return {
        checkboxLeft: checkbox.left,
        checkboxRight: checkbox.right,
        checkboxMiddle: checkbox.top + checkbox.height / 2,
        titleLeft: title.left,
        titleMiddle: title.top + title.height / 2,
        toolbarTop: toolbar.top,
        toolbarPosition: getComputedStyle(toolbarElement).position,
        overflowY: getComputedStyle(element).overflowY,
        breadcrumbScrollWidth: breadcrumbElement.scrollWidth,
        breadcrumbWidth: breadcrumb.width,
      };
    });
    expect(activeLayout.checkboxLeft).toBeLessThan(activeLayout.titleLeft);
    expect(activeLayout.titleLeft - activeLayout.checkboxRight).toBeGreaterThanOrEqual(16);
    expect(activeLayout.titleLeft - activeLayout.checkboxRight).toBeLessThanOrEqual(24);
    expect(Math.abs(activeLayout.checkboxMiddle - activeLayout.titleMiddle)).toBeLessThanOrEqual(3);
    expect(activeLayout.toolbarPosition).toBe("sticky");
    expect(activeLayout.overflowY).toBe("auto");
    expect(activeLayout.breadcrumbScrollWidth).toBeGreaterThan(activeLayout.breadcrumbWidth);

    const scrolledLayout = await page.$eval("#bookmarks", (element) => {
      const toolbar = element.querySelector(".bulk-controls");
      const row = element.querySelector(".bookmark-row");
      if (!(toolbar instanceof HTMLElement) || !(row instanceof HTMLElement)) {
        throw new TypeError("Scrollable selection layout was not rendered");
      }
      const before = { toolbarTop: toolbar.getBoundingClientRect().top, rowTop: row.getBoundingClientRect().top };
      element.scrollTop = 240;
      return new Promise<{ readonly toolbarTop: number; readonly rowTop: number }>((resolve) => {
        requestAnimationFrame(() => resolve({
          toolbarTop: toolbar.getBoundingClientRect().top,
          rowTop: row.getBoundingClientRect().top,
        }));
      }).then((after) => ({ before, after }));
    });
    expect(Math.abs(scrolledLayout.after.toolbarTop - activeLayout.toolbarTop)).toBeLessThanOrEqual(2);
    expect(scrolledLayout.after.rowTop).toBeLessThan(scrolledLayout.before.rowTop - 100);

    await page.click(".selection-mode-toggle");
    expect(await page.$eval("#bookmarks", (element) => ({
      maxHeight: getComputedStyle(element).maxHeight,
      overflowY: getComputedStyle(element).overflowY,
      toolbarPosition: getComputedStyle(element.querySelector(".bulk-controls") ?? element).position,
    }))).toEqual({ maxHeight: "none", overflowY: "visible", toolbarPosition: "static" });
  }, 60_000);
});
