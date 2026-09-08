import puppeteer, { type Browser, type WebWorker } from "puppeteer";
import { afterEach, describe, expect, it } from "vitest";

const extensionPath = decodeURIComponent(new URL("../../dist", import.meta.url).pathname);
const bookmarkTitle = "Markd tracer bookmark";
const bookmarkUrl = "https://example.com/markd-tracer?source=native";

let browser: Browser | undefined;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

async function extensionWorker(activeBrowser: Browser): Promise<WebWorker> {
  const target = await activeBrowser.waitForTarget(
    (candidate) => candidate.type() === "service_worker" && candidate.url().startsWith("chrome-extension://"),
  );
  const worker = await target.worker();
  if (worker === null) {
    throw new TypeError("The extension service worker target had no worker context");
  }
  return worker;
}

afterEach(async () => {
  await browser?.close();
  browser = undefined;
});

describe("built extension tracer", () => {
  it(
    "opens an untouched native bookmark in the foreground when the library row is activated",
    async () => {
      // Given: a least-privilege built extension and a bookmark in an isolated Chromium profile.
      browser = await puppeteer.launch({
        headless: true,
        enableExtensions: [extensionPath],
      });
      const worker = await extensionWorker(browser);
      const emittedManifest: unknown = await worker.evaluate(async () => {
        const response = await fetch(chrome.runtime.getURL("manifest.json"));
        return response.json();
      });
      expect(isRecord(emittedManifest)).toBe(true);
      if (!isRecord(emittedManifest)) {
        throw new TypeError("The emitted manifest was not a JSON object");
      }
      expect(emittedManifest).toMatchObject({
        manifest_version: 3,
        minimum_chrome_version: "90",
        permissions: ["bookmarks"],
      });
      expect(Object.keys(emittedManifest)).not.toContain("host_permissions");
      expect(Object.keys(emittedManifest)).not.toContain("content_scripts");
      await worker.evaluate(
        async ({ title, url }) => chrome.bookmarks.create({ parentId: "1", title, url }),
        { title: bookmarkTitle, url: bookmarkUrl },
      );

      // When: the toolbar action is triggered and its rendered bookmark row is activated.
      const libraryUrl = await worker.evaluate(() => chrome.runtime.getURL("library.html"));
      const extension = [...(await browser.extensions()).values()].find(
        (candidate) => candidate.name === "Markd",
      );
      if (extension === undefined) {
        throw new TypeError("The built Markd extension was not loaded");
      }
      const actionPage = await browser.newPage();
      await extension.triggerAction(actionPage);
      const libraryTarget = await browser.waitForTarget((candidate) => candidate.url() === libraryUrl);
      const libraryPage = await libraryTarget.page();
      if (libraryPage === null) {
        throw new TypeError("The toolbar action did not create a library page");
      }
      await libraryPage.bringToFront();
      const bookmark = await libraryPage.waitForSelector("a");
      if (bookmark === null) {
        throw new TypeError("The native bookmark was not rendered as a link");
      }
      expect(await bookmark.evaluate((element) => element.textContent)).toBe(bookmarkTitle);
      await bookmark.click();

      // Then: the exact native URL is active while the Markd page remains open.
      const openedTarget = await browser.waitForTarget((candidate) => candidate.url() === bookmarkUrl);
      const openedPage = await openedTarget.page();
      expect(openedPage).not.toBeNull();
      expect(await openedPage?.evaluate(() => document.visibilityState)).toBe("visible");
      expect(libraryPage.url()).toBe(libraryUrl);
      expect(libraryPage.isClosed()).toBe(false);
    },
    30_000,
  );
});
