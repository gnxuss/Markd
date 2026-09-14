import { afterEach, describe, expect, it } from "vitest";

import { launchExtension, type ExtensionFixture } from "./fixtures.js";

let fixture: ExtensionFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

describe("Quick Save library entry built Chromium", () => {
  it("opens the full Library from the installed Quick Save action", async () => {
    // Given: the installed action is opened on a normal active page.
    fixture = await launchExtension([]);
    const activePage = await fixture.browser.newPage();
    await activePage.setRequestInterception(true);
    activePage.on("request", (request) => {
      void request.respond({ status: 200, contentType: "text/html", body: "<title>Library entry article</title>" });
    });
    await activePage.goto("https://library-entry.example/article");
    const extension = [...(await fixture.browser.extensions()).values()]
      .find((candidate) => candidate.name === "Markd");
    if (extension === undefined) throw new TypeError("The built Markd extension was not loaded");
    const popupTarget = fixture.browser.waitForTarget((target) => target.url().endsWith("/quick-save.html"));
    await extension.triggerAction(activePage);
    const popup = await (await popupTarget).asPage();
    await popup.waitForSelector("#tag-input");
    expect(await popup.$eval("#page-title", (element) => element.textContent)).toBe("Library entry article");
    expect(await popup.$eval("#tag-input", (element) => element === document.activeElement)).toBe(true);

    // When: the user activates the popup's compact Library action.
    const libraryTarget = fixture.browser.waitForTarget((target) => target.url() === fixture?.libraryUrl);
    await popup.click("#open-library");
    const libraryPage = await (await libraryTarget).asPage();

    // Then: exactly one active full Library tab exists and command packaging is unchanged.
    expect(await libraryPage.evaluate(() => document.visibilityState)).toBe("visible");
    expect(fixture.browser.targets().filter((target) => target.url() === fixture?.libraryUrl)).toHaveLength(1);
    const manifest = await fixture.worker.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.action?.default_popup).toBe("quick-save.html");
    expect(manifest.commands).toEqual({
      "_execute_action": {
        suggested_key: { default: "Ctrl+Shift+Period", mac: "Command+Shift+Period" },
        description: "Open Quick Save",
      },
      "open-library": {
        suggested_key: { default: "Ctrl+Shift+L", mac: "Command+Shift+L" },
        description: "Open Markd library",
      },
    });
  }, 30_000);
});
