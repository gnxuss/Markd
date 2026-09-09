import { afterEach, describe, expect, it } from "vitest";

import { launchExtension, type ExtensionFixture } from "./fixtures.js";

let fixture: ExtensionFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

describe("live native synchronization built Chromium", () => {
  it("refreshes current native fields and membership while retaining tags by ID", async () => {
    fixture = await launchExtension([
      { kind: "bookmark", key: "first", title: "First", url: "https://first.example/original" },
      { kind: "bookmark", key: "second", title: "Second", url: "https://second.example/original" },
    ]);
    const page = await fixture.openLibrary();
    const firstId = fixture.bookmarks["first"]?.id;
    const secondId = fixture.bookmarks["second"]?.id;
    if (firstId === undefined || secondId === undefined) throw new TypeError("Seed IDs unavailable");
    const first = `[data-bookmark-id="${firstId}"]`;
    await page.type(`${first} .tag-input`, "Design");
    await page.keyboard.press("Enter");
    await page.waitForSelector(`${first} .tag-chip`);

    const createdId = await fixture.worker.evaluate(async ({ firstBookmarkId, secondBookmarkId }) => {
      await chrome.bookmarks.update(firstBookmarkId, {
        title: "First renamed",
        url: "https://first.example/changed",
      });
      await chrome.bookmarks.move(firstBookmarkId, { parentId: "1", index: 1 });
      const created = await chrome.bookmarks.create({
        parentId: "1",
        title: "Created elsewhere",
        url: "https://created.example/new",
      });
      await chrome.bookmarks.remove(secondBookmarkId);
      return created.id;
    }, { firstBookmarkId: firstId, secondBookmarkId: secondId });

    await page.waitForFunction(
      ({ selector, newId }) => {
        const row = document.querySelector(selector);
        return row?.textContent?.includes("First renamed") === true
          && row.querySelector("a")?.getAttribute("href") === "https://first.example/changed"
          && row.querySelector(".tag-chip")?.textContent?.includes("Design") === true
          && document.querySelector(`[data-bookmark-id="${newId}"]`) !== null;
      },
      {},
      { selector: first, newId: createdId },
    );
    expect(await page.$(`[data-bookmark-id="${secondId}"]`)).toBeNull();
    expect(await page.$$eval(".bookmark-row", (rows) => rows.map((row) => row.getAttribute("data-bookmark-id")))).toEqual([
      firstId,
      createdId,
    ]);
  }, 30_000);
});
