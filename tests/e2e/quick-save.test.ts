import { afterEach, describe, expect, it } from "vitest";

import { launchExtension, type ExtensionFixture } from "./fixtures.js";

let fixture: ExtensionFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

describe("Quick Save built Chromium", () => {
  it("saves a new active page into a native folder with an exact-ID tag", async () => {
    // Given: a normal active page and an isolated profile with a nested native folder.
    fixture = await launchExtension([{ kind: "folder", title: "Research", children: [] }]);
    const activePage = await fixture.browser.newPage();
    await activePage.setRequestInterception(true);
    activePage.on("request", (request) => {
      void request.respond({ status: 200, contentType: "text/html", body: "<title>Fresh article</title><h1>Fresh article</h1>" });
    });
    await activePage.goto("https://fresh.example/article");
    const extension = [...(await fixture.browser.extensions()).values()].find((candidate) => candidate.name === "Markd");
    if (extension === undefined) throw new TypeError("The built Markd extension was not loaded");

    // When: the real toolbar action opens and the form is completed by keyboard.
    const popupTarget = fixture.browser.waitForTarget((target) => target.url().endsWith("/quick-save.html"));
    await extension.triggerAction(activePage);
    const popup = await (await popupTarget).asPage();
    await popup.waitForSelector("#tag-input:not([disabled])");
    expect(await popup.$eval("#page-title", (element) => element.textContent)).toBe("Fresh article");
    expect(await popup.$eval("#tag-input", (element) => element === document.activeElement)).toBe(true);
    await popup.select("#folder", await popup.$eval("#folder option:last-child", (option) => option.value));
    await popup.type("#tag-input", "  Design  ");
    await popup.keyboard.press("Enter");
    await popup.click("#save");
    await popup.waitForFunction(() => document.querySelector("#status")?.textContent === "Saved.");

    // Then: one native bookmark and its canonical metadata exist under the returned ID.
    const result = await fixture.worker.evaluate(async () => {
      const nodes = await chrome.bookmarks.search({ url: "https://fresh.example/article" });
      const bookmark = nodes[0];
      return {
        count: nodes.length,
        parentId: bookmark?.parentId,
        stored: bookmark === undefined ? {} : await chrome.storage.local.get(`bookmark-tags:1:${bookmark.id}`),
      };
    });
    expect(result.count).toBe(1);
    expect(Object.values(result.stored)).toEqual([{ version: 1, tags: [{ key: "design", label: "Design" }] }]);
  }, 30_000);
});
