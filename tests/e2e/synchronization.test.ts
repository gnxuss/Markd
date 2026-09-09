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

    await fixture.native.update(firstId, {
      title: "First renamed",
      url: "https://first.example/changed",
    });
    await fixture.native.move(firstId, { parentId: "1", index: 1 });
    const createdId = await fixture.native.create({
      parentId: "1",
      title: "Created elsewhere",
      url: "https://created.example/new",
    });
    await fixture.native.remove(secondId);

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

describe("inactive native synchronization built Chromium", () => {
  it("wakes the worker and cleans every recursively deleted descendant assignment", async () => {
    fixture = await launchExtension([
      { kind: "bookmark", key: "survivor", title: "Survivor", url: "https://survivor.example" },
    ]);
    const folderId = await fixture.native.create({ parentId: "1", title: "Disposable folder" });
    const firstId = await fixture.native.create({
      parentId: folderId,
      title: "Nested first",
      url: "https://nested-one.example",
    });
    const secondId = await fixture.native.create({
      parentId: folderId,
      title: "Nested second",
      url: "https://nested-two.example",
    });
    const survivorId = fixture.bookmarks["survivor"]?.id;
    if (survivorId === undefined) throw new TypeError("Survivor seed ID unavailable");
    const page = await fixture.openLibrary();
    for (const id of [survivorId, firstId, secondId]) {
      const selector = `[data-bookmark-id="${id}"]`;
      await page.type(`${selector} .tag-input`, "Keep");
      await page.keyboard.press("Enter");
      await page.waitForSelector(`${selector} .tag-chip`);
    }
    await fixture.worker.evaluate(async () => chrome.storage.local.set({ unrelated: "preserve" }));

    await fixture.closeAllLibraryPages();
    await fixture.terminateWorker();
    await fixture.native.removeTree(folderId);
    const worker = await fixture.reacquireWorker();
    await worker.evaluate(async ({ first, second }) => {
      const firstKey = `bookmark-tags:1:${first}`;
      const secondKey = `bookmark-tags:1:${second}`;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const stored = await chrome.storage.local.get(null);
        if (!(firstKey in stored) && !(secondKey in stored)) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new TypeError("Recursive assignment cleanup did not settle");
    }, { first: firstId, second: secondId });
    const stored = await worker.evaluate(async () => chrome.storage.local.get(null));

    expect(stored).toHaveProperty(`bookmark-tags:1:${survivorId}`);
    expect(stored).toHaveProperty("unrelated", "preserve");
    expect(stored).not.toHaveProperty(`bookmark-tags:1:${firstId}`);
    expect(stored).not.toHaveProperty(`bookmark-tags:1:${secondId}`);
  }, 30_000);
});

describe("restart synchronization built Chromium", () => {
  it("retains valid ID tags and retrieval behavior across worker and browser restarts", async () => {
    const duplicateUrl = "https://duplicate.example/restart";
    fixture = await launchExtension([
      { kind: "bookmark", key: "first", title: "First Design Guide", url: duplicateUrl },
      { kind: "bookmark", key: "second", title: "Second Research", url: duplicateUrl },
      { kind: "bookmark", key: "untagged", title: "Fresh Untagged", url: "https://fresh.example" },
    ]);
    const firstId = fixture.bookmarks["first"]?.id;
    const secondId = fixture.bookmarks["second"]?.id;
    if (firstId === undefined || secondId === undefined) throw new TypeError("Duplicate seed IDs unavailable");
    const page = await fixture.openLibrary();
    const add = async (id: string, label: string): Promise<void> => {
      const selector = `[data-bookmark-id="${id}"]`;
      await page.type(`${selector} .tag-input`, label);
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        ({ row, tag }) => Array.from(document.querySelectorAll(`${row} .tag-chip > span`))
          .some((chip) => chip.textContent === tag),
        {},
        { row: selector, tag: label },
      );
    };
    await add(firstId, "Design");
    await add(firstId, "Research");
    await add(secondId, "Design");
    await page.close();

    await fixture.restartWorker();
    const createdId = await fixture.native.create({
      parentId: "1",
      title: "Created while closed",
      url: "https://created-after-worker.example",
    });
    await fixture.restartBrowser();
    const reopened = await fixture.openLibrary();
    await reopened.click('[data-tag-key="design"]');
    await reopened.click('[data-tag-key="research"]');
    await reopened.type("#bookmark-search", "FIRST DESIGN");

    expect(await reopened.$$(".bookmark-row")).toHaveLength(1);
    expect(await reopened.$(`[data-bookmark-id="${firstId}"]`)).not.toBeNull();
    expect(await reopened.$(`[data-bookmark-id="${secondId}"]`)).toBeNull();
    await reopened.click("#untagged-view");
    await reopened.click('[data-tag-key="design"]');
    await reopened.click('[data-tag-key="research"]');
    await reopened.click("#bookmark-search", { count: 3 });
    await reopened.keyboard.press("Backspace");
    expect(await reopened.$(`[data-bookmark-id="${createdId}"]`)).not.toBeNull();
  }, 45_000);
});
