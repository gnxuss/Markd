import { afterEach, describe, expect, it } from "vitest";

import { launchExtension, type ExtensionFixture } from "./fixtures.js";

let fixture: ExtensionFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

describe("durable add-tag built Chromium", () => {
  it("persists a trimmed tag by native bookmark ID across a page reload", async () => {
    fixture = await launchExtension([
      { kind: "bookmark", key: "target", title: "Target", url: "https://example.com/tag-me" },
    ]);
    const page = await fixture.openLibrary();
    const bookmarkId = fixture.bookmarks["target"]?.id;
    const rowSelector = `[data-bookmark-id="${bookmarkId}"]`;
    await page.waitForSelector(`${rowSelector} .tag-input`);
    await page.type(`${rowSelector} .tag-input`, "  Design  ");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      (selector) => document.querySelector(`${selector} .tag-chip > span`)?.textContent === "Design",
      {},
      rowSelector,
    );

    await page.reload();
    await page.waitForFunction(
      (selector) => document.querySelector(`${selector} .tag-chip > span`)?.textContent === "Design",
      {},
      rowSelector,
    );
    const stored = await fixture.worker.evaluate(async () => chrome.storage.local.get(null));
    expect(stored).toEqual({
      [`bookmark-tags:1:${bookmarkId}`]: {
        version: 1,
        tags: [{ key: "design", label: "Design" }],
      },
    });
  }, 30_000);

  it("emits only bookmarks and storage permissions", async () => {
    fixture = await launchExtension([]);
    const manifest = await fixture.worker.evaluate(async () => {
      const response = await fetch(chrome.runtime.getURL("manifest.json"));
      return response.json();
    });
    expect(manifest).toMatchObject({ permissions: ["bookmarks", "storage"] });
    expect(manifest).not.toHaveProperty("host_permissions");
    expect(manifest).not.toHaveProperty("content_scripts");
  }, 30_000);

  it("keeps All and Untagged visible with truthful first and final tag transitions", async () => {
    fixture = await launchExtension([
      { kind: "bookmark", key: "first", title: "First", url: "https://first.example" },
      { kind: "bookmark", key: "second", title: "Second", url: "https://second.example" },
    ]);
    const page = await fixture.openLibrary();
    const first = `[data-bookmark-id="${fixture.bookmarks["first"]?.id}"]`;
    const second = `[data-bookmark-id="${fixture.bookmarks["second"]?.id}"]`;
    await page.waitForSelector("#all-view");
    expect(await page.$eval("#tag-catalog", (element) => element.textContent?.trim())).toBe("No tags yet");

    await page.click("#untagged-view");
    expect(await page.$$(".bookmark-row")).toHaveLength(2);
    await page.type(`${first} .tag-input`, "Design");
    await page.keyboard.press("Enter");
    await page.waitForFunction((selector) => document.querySelector(selector) === null, {}, first);
    expect(await page.$$(".bookmark-row")).toHaveLength(1);

    await page.type(`${second} .tag-input`, "Research");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector("#status")?.textContent === "All bookmarks are tagged.");
    expect(await page.$$(".bookmark-row")).toHaveLength(0);

    await page.click("#all-view");
    await page.click(`${first} [aria-label="Remove Design"]`);
    await page.click("#untagged-view");
    await page.waitForSelector(first);
    expect(await page.$$(".bookmark-row")).toHaveLength(1);
  }, 30_000);

  it("creates, reuses by pointer and keyboard, and removes independent tags without opening tabs", async () => {
    const duplicateUrl = "https://duplicate.example/same";
    fixture = await launchExtension([
      { kind: "bookmark", key: "first", title: "First", url: duplicateUrl },
      { kind: "bookmark", key: "second", title: "Second", url: duplicateUrl },
      { kind: "bookmark", key: "third", title: "Third", url: "https://third.example" },
    ]);
    const page = await fixture.openLibrary();
    const selector = (key: string): string => `[data-bookmark-id="${fixture?.bookmarks[key]?.id}"]`;
    const pageCount = (await fixture.browser.pages()).length;

    await page.type(`${selector("first")} .tag-input`, "Design");
    await page.keyboard.press("Enter");
    await page.waitForSelector(`${selector("first")} .tag-chip`);
    await page.type(`${selector("first")} .tag-input`, "Research");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      (row) => document.querySelectorAll(`${row} .tag-chip`).length === 2,
      {},
      selector("first"),
    );

    await page.type(`${selector("second")} .tag-input`, "des");
    await page.waitForSelector(`${selector("second")} .tag-suggestion[data-kind="existing"]`);
    await page.click(`${selector("second")} .tag-suggestion[data-kind="existing"]`);
    await page.waitForFunction(
      (row) => document.querySelector(`${row} .tag-chip`)?.textContent?.includes("Design") === true,
      {},
      selector("second"),
    );

    await page.type(`${selector("second")} .tag-input`, "Reference");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      (row) => document.querySelectorAll(`${row} .tag-chip`).length === 2,
      {},
      selector("second"),
    );
    await page.type(`${selector("third")} .tag-input`, "ref");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      (row) => document.querySelector(`${row} .tag-chip`)?.textContent?.includes("Reference") === true,
      {},
      selector("third"),
    );

    await page.click(`${selector("first")} [aria-label="Remove Research"]`);
    await page.waitForFunction(
      (row) => Array.from(document.querySelectorAll(`${row} .tag-chip`)).every(
        (chip) => !chip.textContent?.includes("Research"),
      ),
      {},
      selector("first"),
    );

    expect(await fixture.browser.pages()).toHaveLength(pageCount);
    expect(await page.$$eval(`${selector("first")} .tag-chip`, (chips) => chips.map((chip) => chip.textContent?.trim()))).toEqual(["Design×"]);
    expect(await page.$$eval(`${selector("second")} .tag-chip`, (chips) => chips.map((chip) => chip.textContent?.trim()))).toEqual(["Design×", "Reference×"]);
  }, 30_000);

  it("retains independent native-ID tags across page, worker, and browser lifecycles", async () => {
    const duplicateUrl = "https://duplicate.example/persistent";
    fixture = await launchExtension([
      { kind: "bookmark", key: "first", title: "First", url: duplicateUrl },
      { kind: "bookmark", key: "second", title: "Second", url: duplicateUrl },
      { kind: "bookmark", key: "untagged", title: "Untagged", url: "https://untagged.example" },
    ]);
    const first = `[data-bookmark-id="${fixture.bookmarks["first"]?.id}"]`;
    const second = `[data-bookmark-id="${fixture.bookmarks["second"]?.id}"]`;
    const assertAssignments = async (): Promise<void> => {
      const page = await fixture?.openLibrary();
      if (page === undefined) throw new TypeError("Fixture unavailable");
      await page.waitForSelector(`${first} .tag-chip`);
      expect(await page.$eval(`${first} .tag-chip > span`, (element) => element.textContent)).toBe("Design");
      expect(await page.$eval(`${second} .tag-chip > span`, (element) => element.textContent)).toBe("Research");
      await page.click("#untagged-view");
      expect(await page.$$(".bookmark-row")).toHaveLength(1);
      await page.close();
    };

    const page = await fixture.openLibrary();
    await page.type(`${first} .tag-input`, "Design");
    await page.keyboard.press("Enter");
    await page.waitForSelector(`${first} .tag-chip`);
    await page.type(`${second} .tag-input`, "Research");
    await page.keyboard.press("Enter");
    await page.waitForSelector(`${second} .tag-chip`);
    await page.close();

    await assertAssignments();
    await fixture.restartWorker();
    await assertAssignments();
    await fixture.restartBrowser();
    await assertAssignments();
  }, 45_000);
});
