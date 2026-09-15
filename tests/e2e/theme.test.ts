import { afterEach, describe, expect, it } from "vitest";
import type { Page } from "puppeteer";

import { launchExtension, type ExtensionFixture } from "./fixtures.js";

let fixture: ExtensionFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function openActivePage(browserFixture: ExtensionFixture): Promise<Page> {
  const page = await browserFixture.browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    void request.respond({ status: 200, contentType: "text/html", body: "<title>Theme test</title>" });
  });
  await page.goto("https://theme.example/article");
  return page;
}

async function openQuickSave(browserFixture: ExtensionFixture, activePage: Page): Promise<Page> {
  const extension = [...(await browserFixture.browser.extensions()).values()]
    .find((candidate) => candidate.name === "Markd");
  if (extension === undefined) throw new TypeError("The built Markd extension was not loaded");
  const popupTarget = browserFixture.browser.waitForTarget((target) => target.url().endsWith("/quick-save.html"));
  await extension.triggerAction(activePage);
  const popup = await (await popupTarget).asPage();
  await popup.waitForSelector("#tag-input:not([disabled])");
  return popup;
}

describe("persistent theme", () => {
  it("shares the selected Library theme with Quick Save across a browser restart", async () => {
    fixture = await launchExtension([]);
    const library = await fixture.openLibrary();
    expect(await library.$eval("html", (element) => element.dataset["theme"])).toBe("light");

    await library.click("#theme-toggle");
    expect(await library.$eval("html", (element) => element.dataset["theme"])).toBe("dark");
    expect(await library.$eval("#theme-toggle", (element) => element.textContent)).toBe("Light mode");
    expect(await library.evaluate(() => localStorage.getItem("markd-theme"))).toBe("dark");

    const popup = await openQuickSave(fixture, await openActivePage(fixture));
    expect(await popup.$eval("html", (element) => element.dataset["theme"])).toBe("dark");

    await fixture.restartBrowser();
    const restartedLibrary = await fixture.openLibrary();
    expect(await restartedLibrary.$eval("html", (element) => element.dataset["theme"])).toBe("dark");
    expect(await restartedLibrary.$eval("#theme-toggle", (element) => element.textContent)).toBe("Light mode");

    await restartedLibrary.click("#theme-toggle");
    const lightPopup = await openQuickSave(fixture, await openActivePage(fixture));
    expect(await lightPopup.$eval("html", (element) => element.dataset["theme"])).toBe("light");
  }, 45_000);
});
