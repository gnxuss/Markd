import { afterEach, describe, expect, it, vi } from "vitest";

import { launchExtension, type ExtensionFixture, type SeedNode } from "./fixtures.js";

let fixture: ExtensionFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

describe("native bookmark moving built Chromium", () => {
  it("moves one exact bookmark from Details and preserves its metadata and active criteria", async () => {
    // Given: one tagged, noted bookmark and a distinct nested destination.
    fixture = await launchExtension([
      { kind: "folder", title: "Move source", children: [
        { kind: "bookmark", key: "target", title: "Move target", url: "https://move.example/target" },
      ] },
      { kind: "folder", title: "Move destination", children: [
        { kind: "folder", title: "Nested destination", children: [] },
      ] },
    ]);
    const bookmarkId = fixture.bookmarks["target"]?.id;
    if (bookmarkId === undefined) throw new TypeError("Move target unavailable");
    const folderIds = await fixture.worker.evaluate(async () => {
      const source = (await chrome.bookmarks.search({ title: "Move source" }))[0];
      const destination = (await chrome.bookmarks.search({ title: "Nested destination" }))[0];
      if (source === undefined || destination === undefined) throw new TypeError("Move folders unavailable");
      return { source: source.id, destination: destination.id };
    });
    const tagPayload = { version: 1, tags: [{ key: "move", label: "Move" }] } as const;
    const notePayload = { version: 1, note: "Keep this note" } as const;
    await fixture.worker.evaluate(async ({ id, tags, note }) => chrome.storage.local.set({
      [`bookmark-tags:1:${id}`]: tags,
      [`bookmark-note:1:${id}`]: note,
    }), { id: bookmarkId, tags: tagPayload, note: notePayload });
    const page = await fixture.openLibrary();
    const row = `[data-bookmark-id="${bookmarkId}"]`;
    while (await page.$(`[data-folder-id="${folderIds.source}"]`) === null) {
      const disclosure = await page.$('.folder-disclosure[aria-expanded="false"]');
      if (disclosure === null) throw new TypeError("Source folder was not rendered");
      await disclosure.click();
    }
    await page.type("#bookmark-search", "Move target");
    await page.click('[data-tag-key="move"]');
    await page.click(`[data-folder-id="${folderIds.source}"]`);
    await page.click(`${row} .details-toggle`);
    await page.waitForSelector(`${row} .bookmark-move-folder`);
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

    // When: the already-loaded nested destination is chosen and explicitly submitted.
    await page.select(`${row} .bookmark-move-folder`, folderIds.destination);
    expect(await page.evaluate(() => ({
      bookmarks: document.documentElement.dataset["bookmarkReads"],
      storage: document.documentElement.dataset["storageReads"],
    }))).toEqual({ bookmarks: "0", storage: "0" });
    await page.click(`${row} .bookmark-move-submit`);
    await vi.waitFor(async () => {
      const parentId = await fixture?.worker.evaluate(async (id) => (await chrome.bookmarks.get(id))[0]?.parentId, bookmarkId);
      expect(parentId).toBe(folderIds.destination);
    });
    await page.waitForFunction((selector) => document.querySelector(selector) === null, {}, row);

    // Then: lifecycle refresh applies the active source filter and exact-ID metadata survives.
    expect(await page.$eval("#bookmark-search", (element) => {
      if (!(element instanceof HTMLInputElement)) throw new TypeError("Search input unavailable");
      return element.value;
    })).toBe("Move target");
    expect(await page.$eval('[data-tag-key="move"]', (element) => element.getAttribute("aria-pressed"))).toBe("true");
    await page.click(".folder-clear");
    expect(await page.$(row)).not.toBeNull();
    while (await page.$(`[data-folder-id="${folderIds.destination}"]`) === null) {
      const disclosure = await page.$('.folder-disclosure[aria-expanded="false"]');
      if (disclosure === null) throw new TypeError("Destination folder was not rendered");
      await disclosure.click();
    }
    await page.click(`[data-folder-id="${folderIds.destination}"]`);
    expect(await page.$(row)).not.toBeNull();
    const stored = await fixture.worker.evaluate(async (id) => chrome.storage.local.get([
      `bookmark-tags:1:${id}`,
      `bookmark-note:1:${id}`,
    ]), bookmarkId);
    expect(stored[`bookmark-tags:1:${bookmarkId}`]).toEqual(tagPayload);
    expect(stored[`bookmark-note:1:${bookmarkId}`]).toEqual(notePayload);
  }, 60_000);

  it("moves duplicate-URL selections across pages and retains exact metadata", async () => {
    // Given: 102 matching source bookmarks with equal-URL endpoints and exact metadata.
    const sourceBookmarks = Array.from({ length: 102 }, (_, index) => ({
      kind: "bookmark" as const,
      key: `bulk-${index}`,
      title: `Bulk move ${String(index).padStart(3, "0")}`,
      url: index === 0 || index === 101
        ? "https://move.example/duplicate"
        : `https://move.example/${index}`,
    })) satisfies readonly SeedNode[];
    fixture = await launchExtension([
      { kind: "folder", title: "Bulk source", children: sourceBookmarks },
      { kind: "folder", title: "Bulk destination", children: [
        { kind: "folder", title: "Bulk nested", children: [] },
      ] },
    ]);
    const firstId = fixture.bookmarks["bulk-0"]?.id;
    const lastId = fixture.bookmarks["bulk-101"]?.id;
    if (firstId === undefined || lastId === undefined) throw new TypeError("Bulk move IDs unavailable");
    const folderIds = await fixture.worker.evaluate(async () => {
      const source = (await chrome.bookmarks.search({ title: "Bulk source" }))[0];
      const destination = (await chrome.bookmarks.search({ title: "Bulk nested" }))[0];
      if (source === undefined || destination === undefined) throw new TypeError("Bulk folders unavailable");
      return { source: source.id, destination: destination.id };
    });
    const tagPayload = { version: 1, tags: [{ key: "movable", label: "Movable" }] } as const;
    const firstNote = { version: 1, note: "First exact note" } as const;
    const lastNote = { version: 1, note: "Last exact note" } as const;
    await fixture.worker.evaluate(async ({ ids, tags, notes }) => {
      const records: Record<string, unknown> = {};
      for (const id of ids) records[`bookmark-tags:1:${id}`] = tags;
      records[`bookmark-note:1:${ids[0]}`] = notes[0];
      records[`bookmark-note:1:${ids[ids.length - 1]}`] = notes[1];
      await chrome.storage.local.set(records);
    }, {
      ids: sourceBookmarks.map(({ key }) => fixture?.bookmarks[key]?.id).filter((id): id is string => id !== undefined),
      tags: tagPayload,
      notes: [firstNote, lastNote],
    });
    const page = await fixture.openLibrary();
    while (await page.$(`[data-folder-id="${folderIds.source}"]`) === null) {
      const disclosure = await page.$('.folder-disclosure[aria-expanded="false"]');
      if (disclosure === null) throw new TypeError("Bulk source was not rendered");
      await disclosure.click();
    }
    await page.click(`[data-folder-id="${folderIds.source}"]`);
    await page.type("#bookmark-search", "Bulk move");
    await page.click('[data-tag-key="movable"]');
    await page.click(".selection-mode-toggle");
    await page.click(`[data-bookmark-id="${firstId}"] .bookmark-selection input`);
    await page.click(".pagination-button:last-child");
    await page.click(`[data-bookmark-id="${lastId}"] .bookmark-selection input`);

    // When: the cross-page exact selection is moved to one loaded nested folder.
    await page.select(".bulk-move-folder", folderIds.destination);
    await page.click(".bulk-move-submit");
    await vi.waitFor(async () => {
      const parents = await fixture?.worker.evaluate(async (ids) => Promise.all(
        ids.map(async (id) => (await chrome.bookmarks.get(id))[0]?.parentId),
      ), [firstId, lastId]);
      expect(parents).toEqual([folderIds.destination, folderIds.destination]);
    });
    await page.waitForFunction(() => document.querySelector(".selection-count")?.textContent === "0 selected");

    // Then: active criteria remain, moved rows leave the source, and exact records survive.
    expect(await page.$(`[data-bookmark-id="${firstId}"]`)).toBeNull();
    expect(await page.$(`[data-bookmark-id="${lastId}"]`)).toBeNull();
    expect(await page.$eval("#bookmark-search", (element) => {
      if (!(element instanceof HTMLInputElement)) throw new TypeError("Search input unavailable");
      return element.value;
    })).toBe("Bulk move");
    expect(await page.$eval('[data-tag-key="movable"]', (element) => element.getAttribute("aria-pressed"))).toBe("true");
    await page.click(".folder-clear");
    while (await page.$(`[data-folder-id="${folderIds.destination}"]`) === null) {
      const disclosure = await page.$('.folder-disclosure[aria-expanded="false"]');
      if (disclosure === null) throw new TypeError("Bulk destination was not rendered");
      await disclosure.click();
    }
    await page.click(`[data-folder-id="${folderIds.destination}"]`);
    expect(await page.$(`[data-bookmark-id="${firstId}"]`)).not.toBeNull();
    expect(await page.$(`[data-bookmark-id="${lastId}"]`)).not.toBeNull();
    const stored = await fixture.worker.evaluate(async (ids) => chrome.storage.local.get(ids.flatMap((id) => [
      `bookmark-tags:1:${id}`,
      `bookmark-note:1:${id}`,
    ])), [firstId, lastId]);
    expect(stored[`bookmark-tags:1:${firstId}`]).toEqual(tagPayload);
    expect(stored[`bookmark-note:1:${firstId}`]).toEqual(firstNote);
    expect(stored[`bookmark-tags:1:${lastId}`]).toEqual(tagPayload);
    expect(stored[`bookmark-note:1:${lastId}`]).toEqual(lastNote);
  }, 90_000);
});
