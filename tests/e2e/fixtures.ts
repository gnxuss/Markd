import puppeteer, { type Browser, type Page, type WebWorker } from "puppeteer";

export type SeedBookmark = {
  readonly kind: "bookmark";
  readonly key: string;
  readonly title: string;
  readonly url: string;
};

export type SeedFolder = {
  readonly kind: "folder";
  readonly title: string;
  readonly children: readonly SeedNode[];
};

export type SeedNode = SeedBookmark | SeedFolder;

export type SeededBookmark = SeedBookmark & { readonly id: string };

export type ExtensionFixture = {
  readonly browser: Browser;
  readonly worker: WebWorker;
  readonly libraryUrl: string;
  readonly bookmarks: Readonly<Record<string, SeededBookmark>>;
  readonly openLibrary: () => Promise<Page>;
};

const extensionPath = decodeURIComponent(new URL("../../dist", import.meta.url).pathname);

async function extensionWorker(browser: Browser): Promise<WebWorker> {
  const target = await browser.waitForTarget(
    (candidate) => candidate.type() === "service_worker" && candidate.url().startsWith("chrome-extension://"),
  );
  const worker = await target.worker();
  if (worker === null) throw new TypeError("The extension service worker target had no worker context");
  return worker;
}

export async function launchExtension(_nodes: readonly SeedNode[]): Promise<ExtensionFixture> {
  const browser = await puppeteer.launch({ headless: true, enableExtensions: [extensionPath] });
  const worker = await extensionWorker(browser);
  const libraryUrl = await worker.evaluate(() => chrome.runtime.getURL("library.html"));
  return {
    browser,
    worker,
    libraryUrl,
    bookmarks: {},
    openLibrary: async () => {
      const page = await browser.newPage();
      await page.goto(libraryUrl);
      return page;
    },
  };
}
