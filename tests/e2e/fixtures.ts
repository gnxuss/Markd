import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Browser, Page, WebWorker } from "puppeteer";
import { launchExtensionRuntime } from "./extension-runtime.js";
import {
  createNativeBookmarkDriver,
  materializeNativeBookmarkDriver,
  type NativeBookmarkDriver,
} from "./native-bookmark-driver.js";

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
  readonly native: NativeBookmarkDriver;
  readonly openLibrary: () => Promise<Page>;
  readonly closeAllLibraryPages: () => Promise<void>;
  readonly terminateWorker: () => Promise<void>;
  readonly reacquireWorker: () => Promise<WebWorker>;
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

export async function launchExtension(
  nodes: readonly SeedNode[],
  withNativeDriver = false,
): Promise<ExtensionFixture> {
  const fixtureDirectory = await mkdtemp(join(tmpdir(), "markd-e2e-"));
  const profileDirectory = join(fixtureDirectory, "profile");
  const driverPath = withNativeDriver
    ? await materializeNativeBookmarkDriver(fixtureDirectory)
    : undefined;
  const runtime = await launchExtensionRuntime({
    userDataDir: profileDirectory,
    extensionPath,
    distinguishExtension: withNativeDriver,
    ...(driverPath === undefined ? {} : { driverPath }),
  });
  const native = createNativeBookmarkDriver(() => runtime.browser);
  let closed = false;
  const seeded: Record<string, SeededBookmark> = {};
  const createNodes = async (parentId: string, children: readonly SeedNode[]): Promise<void> => {
    for (const node of children) {
      switch (node.kind) {
        case "bookmark": {
          const id = await native.create({ parentId, title: node.title, url: node.url });
          seeded[node.key] = { ...node, id };
          break;
        }
        case "folder": {
          const id = await native.create({ parentId, title: node.title });
          await createNodes(id, node.children);
          break;
        }
        default: {
          const exhaustiveNode: never = node;
          return exhaustiveNode;
        }
      }
    }
  };
  if (withNativeDriver) {
    await createNodes("1", nodes);
  } else {
    const workerSeeded = await runtime.worker.evaluate(async (seedNodes: readonly SeedNode[]) => {
      const createdBookmarks: Record<string, SeededBookmark> = {};
      const createWorkerNodes = async (parentId: string, children: readonly SeedNode[]): Promise<void> => {
        for (const node of children) {
          switch (node.kind) {
            case "bookmark": {
              const created = await chrome.bookmarks.create({ parentId, title: node.title, url: node.url });
              createdBookmarks[node.key] = { ...node, id: created.id };
              break;
            }
            case "folder": {
              const created = await chrome.bookmarks.create({ parentId, title: node.title });
              await createWorkerNodes(created.id, node.children);
              break;
            }
            default: {
              const exhaustiveNode: never = node;
              return exhaustiveNode;
            }
          }
        }
      };
      await createWorkerNodes("1", seedNodes);
      return createdBookmarks;
    }, nodes);
    Object.assign(seeded, workerSeeded);
  }
  const bookmarks: Readonly<Record<string, SeededBookmark>> = seeded;
  const libraryUrl = await runtime.worker.evaluate(() => chrome.runtime.getURL("library.html"));
  return {
    get browser(): Browser { return runtime.browser; },
    get worker(): WebWorker { return runtime.worker; },
    libraryUrl,
    bookmarks,
    native,
    openLibrary: async () => {
      const page = await runtime.browser.newPage();
      await page.goto(libraryUrl);
      await page.waitForFunction(
        () => document.querySelector("#status")?.textContent !== "Loading bookmarks…",
      );
      return page;
    },
    closeAllLibraryPages: async () => {
      const pages = await runtime.browser.pages();
      await Promise.all(pages.filter((page) => page.url() === libraryUrl).map((page) => page.close()));
    },
    terminateWorker: runtime.terminateWorker,
    reacquireWorker: runtime.reacquireWorker,
    restartWorker: async () => runtime.restartWorker(libraryUrl),
    restartBrowser: runtime.restartBrowser,
    close: async () => {
      if (closed) return;
      closed = true;
      await runtime.close();
      await rm(fixtureDirectory, { force: true, recursive: true });
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
