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
  const extension = [...(await fixture.browser.extensions()).values()]
    .find((candidate) => candidate.name === "Markd");
  if (extension === undefined) throw new TypeError("The built Markd extension was not loaded");
  const popupTarget = fixture.browser.waitForTarget((target) => target.url().endsWith("/quick-save.html"));
  await extension.triggerAction(activePage);
  const popup = await (await popupTarget).asPage();
  await popup.waitForSelector("#tag-input");
  return popup;
}

describe("Library note details built Chromium", () => {
  it("synchronizes an exact-ID note from Quick Save through Library and back", async () => {
    // Given: Quick Save creates a native bookmark with a note.
    fixture = await launchExtension([]);
    const pageUrl = "https://notes.example/article";
    const activePage = await fixture.browser.newPage();
    await activePage.setRequestInterception(true);
    activePage.on("request", (request) => {
      void request.respond({ status: 200, contentType: "text/html", body: "<title>Notes article</title>" });
    });
    await activePage.goto(pageUrl);
    const popup = await openQuickSave(activePage);
    await popup.type("#note", "Quick Save note");
    await popup.click("#save");
    await popup.waitForFunction(() => document.querySelector("#status")?.textContent === "Saved.");
    const bookmarkId = await fixture.worker.evaluate(async (url) => (await chrome.bookmarks.search({ url }))[0]?.id, pageUrl);
    if (bookmarkId === undefined) throw new TypeError("Saved bookmark unavailable");

    // When: Library opens that row, displays the note, and saves an edit.
    const library = await fixture.openLibrary();
    const row = `[data-bookmark-id="${bookmarkId}"]`;
    expect(await library.$(`${row} .tag-suggestions`)).toBeNull();
    await library.click(`${row} .details-toggle`);
    await library.waitForSelector(`${row} .bookmark-note`);
    expect(await library.$eval(`${row} .bookmark-note`, (element) => {
      if (!(element instanceof HTMLTextAreaElement)) throw new TypeError("Note editor unavailable");
      return element.value;
    })).toBe("Quick Save note");
    await library.click(`${row} .bookmark-note`, { count: 3 });
    await library.type(`${row} .bookmark-note`, "Library note");
    await library.click(`${row} .note-save`);
    await vi.waitFor(async () => {
      const stored = await fixture?.worker.evaluate(async (id) => chrome.storage.local.get(`bookmark-note:1:${id}`), bookmarkId);
      expect(stored?.[`bookmark-note:1:${bookmarkId}`]).toEqual({ version: 1, note: "Library note" });
    });

    // Then: reopening Quick Save for the same URL reads the Library value.
    await activePage.bringToFront();
    const reopened = await openQuickSave(activePage);
    expect(await reopened.$eval("#note", (element) => {
      if (!(element instanceof HTMLTextAreaElement)) throw new TypeError("Quick Save note editor unavailable");
      return element.value;
    })).toBe("Library note");
  }, 30_000);

  it("shows, saves, and clears the clean no-note state", async () => {
    // Given: a native bookmark without note metadata.
    fixture = await launchExtension([
      { kind: "bookmark", key: "empty", title: "Empty note", url: "https://notes.example/empty" },
    ]);
    const bookmarkId = fixture.bookmarks["empty"]?.id;
    if (bookmarkId === undefined) throw new TypeError("Seeded bookmark unavailable");
    const library = await fixture.openLibrary();
    const row = `[data-bookmark-id="${bookmarkId}"]`;

    // When: details open, the first note is saved, then cleared.
    await library.click(`${row} .details-toggle`);
    await library.waitForSelector(`${row} .bookmark-note`);
    expect(await library.$eval(`${row} .note-status`, (element) => element.textContent)).toBe("No note yet.");
    expect(await library.$eval(`${row} .bookmark-note`, (element) => {
      if (!(element instanceof HTMLTextAreaElement)) throw new TypeError("Note editor unavailable");
      return element.value;
    })).toBe("");
    await library.type(`${row} .bookmark-note`, "First note");
    await library.click(`${row} .note-save`);
    await library.waitForFunction((selector) => document.querySelector(selector)?.textContent === "Note saved.", {}, `${row} .note-status`);
    await library.click(`${row} .bookmark-note`, { count: 3 });
    await library.keyboard.press("Backspace");
    await library.click(`${row} .note-save`);
    await vi.waitFor(async () => {
      const stored = await fixture?.worker.evaluate(async (id) => chrome.storage.local.get(`bookmark-note:1:${id}`), bookmarkId);
      expect(stored).not.toHaveProperty(`bookmark-note:1:${bookmarkId}`);
    });

    // Then: the confirmed empty state returns without changing the native bookmark.
    expect(await library.$eval(`${row} .note-status`, (element) => element.textContent)).toBe("No note yet.");
    expect((await fixture.worker.evaluate(async (id) => chrome.bookmarks.get(id), bookmarkId))[0]?.title).toBe("Empty note");
  }, 30_000);
});
