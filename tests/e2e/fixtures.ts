import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  readonly restartWorker: () => Promise<void>;
  readonly restartBrowser: () => Promise<void>;
  readonly close: () => Promise<void>;
};

export type BookmarkGesture = "primary" | "modifier-primary" | "middle";

export type OpenedBookmark = {
  readonly libraryPage: Page;
  readonly openedUrl: string;
  readonly libraryVisibility: DocumentVisibilityState;
  readonly matchingTargetCount: number;
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

async function launchBrowser(userDataDir: string): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    enableExtensions: [extensionPath],
    userDataDir,
  });
}

export async function launchExtension(nodes: readonly SeedNode[]): Promise<ExtensionFixture> {
  const profileDirectory = await mkdtemp(join(tmpdir(), "markd-e2e-"));
  let activeBrowser = await launchBrowser(profileDirectory);
  let activeWorker = await extensionWorker(activeBrowser);
  let closed = false;
  const bookmarks = await activeWorker.evaluate(async (seedNodes: readonly SeedNode[]) => {
    const seeded: Record<string, SeededBookmark> = {};
    const createNodes = async (parentId: string, children: readonly SeedNode[]): Promise<void> => {
      for (const node of children) {
        switch (node.kind) {
          case "bookmark": {
            const created = await chrome.bookmarks.create({
              parentId,
              title: node.title,
              url: node.url,
            });
            seeded[node.key] = { ...node, id: created.id };
            break;
          }
          case "folder": {
            const created = await chrome.bookmarks.create({ parentId, title: node.title });
            await createNodes(created.id, node.children);
            break;
          }
          default: {
            const exhaustiveNode: never = node;
            return exhaustiveNode;
          }
        }
      }
    };
    await createNodes("1", seedNodes);
    return seeded;
  }, nodes);
  const libraryUrl = await activeWorker.evaluate(() => chrome.runtime.getURL("library.html"));
  return {
    get browser(): Browser { return activeBrowser; },
    get worker(): WebWorker { return activeWorker; },
    libraryUrl,
    bookmarks,
    openLibrary: async () => {
      const page = await activeBrowser.newPage();
      await page.goto(libraryUrl);
      await page.waitForFunction(
        () => document.querySelector("#status")?.textContent !== "Loading bookmarks…",
      );
      return page;
    },
    restartWorker: async () => {
      await activeWorker.close();
      const extension = [...(await activeBrowser.extensions()).values()].find(
        (candidate) => candidate.name === "Markd",
      );
      if (extension === undefined) throw new TypeError("The built Markd extension was not loaded");
      const actionPage = await activeBrowser.newPage();
      await extension.triggerAction(actionPage);
      const libraryTarget = await activeBrowser.waitForTarget((candidate) => candidate.url() === libraryUrl);
      const openedLibrary = await libraryTarget.page();
      await openedLibrary?.close();
      if (!actionPage.isClosed()) await actionPage.close();
      activeWorker = await extensionWorker(activeBrowser);
    },
    restartBrowser: async () => {
      await activeBrowser.close();
      activeBrowser = await launchBrowser(profileDirectory);
      activeWorker = await extensionWorker(activeBrowser);
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await activeBrowser.close();
      await rm(profileDirectory, { force: true, recursive: true });
    },
  };
}

export async function openSeededBookmark(
  fixture: ExtensionFixture,
  key: string,
  gesture: BookmarkGesture,
): Promise<OpenedBookmark> {
  const bookmark = fixture.bookmarks[key];
  if (bookmark === undefined) throw new TypeError(`Unknown seeded bookmark: ${key}`);
  const libraryPage = await fixture.openLibrary();
  await libraryPage.bringToFront();
  const link = await libraryPage.waitForSelector(`[data-bookmark-id="${bookmark.id}"] .bookmark-link`);
  if (link === null) throw new TypeError(`Bookmark row did not render: ${key}`);
  const openedTarget = fixture.browser.waitForTarget((candidate) => candidate.url() === bookmark.url);
  switch (gesture) {
    case "primary":
      await link.click();
      break;
    case "modifier-primary": {
      const usesMeta = await libraryPage.evaluate(() => navigator.platform.startsWith("Mac"));
      if (usesMeta) {
        await libraryPage.keyboard.down("Meta");
        await link.click();
        await libraryPage.keyboard.up("Meta");
      } else {
        await libraryPage.keyboard.down("Control");
        await link.click();
        await libraryPage.keyboard.up("Control");
      }
      break;
    }
    case "middle":
      await link.click({ button: "middle" });
      break;
    default: {
      const exhaustiveGesture: never = gesture;
      return exhaustiveGesture;
    }
  }
  const target = await openedTarget;
  const libraryVisibility = await libraryPage.evaluate(() => document.visibilityState);
  const matchingTargetCount = fixture.browser.targets().filter((candidate) => candidate.url() === bookmark.url).length;
  return { libraryPage, openedUrl: target.url(), libraryVisibility, matchingTargetCount };
}
