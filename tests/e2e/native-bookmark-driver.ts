import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Browser, WebWorker } from "puppeteer";

export type NativeBookmarkCreate = {
  readonly parentId?: string;
  readonly index?: number;
  readonly title: string;
  readonly url?: string;
};

export type NativeBookmarkUpdate = {
  readonly title?: string;
  readonly url?: string;
};

export type NativeBookmarkMove = {
  readonly parentId?: string;
  readonly index?: number;
};

export type NativeBookmarkDriver = {
  readonly create: (details: NativeBookmarkCreate) => Promise<string>;
  readonly update: (id: string, changes: NativeBookmarkUpdate) => Promise<void>;
  readonly move: (id: string, destination: NativeBookmarkMove) => Promise<void>;
  readonly remove: (id: string) => Promise<void>;
  readonly removeTree: (id: string) => Promise<void>;
};

const DRIVER_NAME = "Markd Native Test Driver";

async function driverWorker(browser: Browser): Promise<WebWorker> {
  await browser.waitForTarget((candidate) => candidate.type() === "service_worker");
  const extension = [...(await browser.extensions()).values()].find(
    (candidate) => candidate.name === DRIVER_NAME,
  );
  if (extension === undefined) throw new TypeError("Native bookmark test driver was not loaded");
  const existing = (await extension.workers())[0];
  if (existing !== undefined) return existing;
  const target = await browser.waitForTarget(
    (candidate) => candidate.url() === `chrome-extension://${extension.id}/background.js`,
  );
  const worker = await target.worker();
  if (worker === null) throw new TypeError("Native bookmark test driver had no worker context");
  return worker;
}

export async function materializeNativeBookmarkDriver(directory: string): Promise<string> {
  const driverDirectory = join(directory, "native-bookmark-driver");
  await mkdir(driverDirectory, { recursive: true });
  await Promise.all([
    writeFile(join(driverDirectory, "manifest.json"), JSON.stringify({
      manifest_version: 3,
      name: DRIVER_NAME,
      version: "1.0.0",
      permissions: ["bookmarks"],
      action: { default_title: "Wake native test driver" },
      background: { service_worker: "background.js" },
    })),
    writeFile(
      join(driverDirectory, "background.js"),
      "chrome.action.onClicked.addListener(() => undefined);",
    ),
  ]);
  return driverDirectory;
}

export function createNativeBookmarkDriver(getBrowser: () => Browser): NativeBookmarkDriver {
  return {
    create: async (details): Promise<string> => {
      const worker = await driverWorker(getBrowser());
      return worker.evaluate(async (createDetails) => {
        const created = await chrome.bookmarks.create(createDetails);
        return created.id;
      }, details);
    },
    update: async (id, changes): Promise<void> => {
      const worker = await driverWorker(getBrowser());
      await worker.evaluate(async ({ bookmarkId, updateChanges }) => {
        await chrome.bookmarks.update(bookmarkId, updateChanges);
      }, { bookmarkId: id, updateChanges: changes });
    },
    move: async (id, destination): Promise<void> => {
      const worker = await driverWorker(getBrowser());
      await worker.evaluate(async ({ bookmarkId, moveDestination }) => {
        await chrome.bookmarks.move(bookmarkId, moveDestination);
      }, { bookmarkId: id, moveDestination: destination });
    },
    remove: async (id): Promise<void> => {
      const worker = await driverWorker(getBrowser());
      await worker.evaluate(async (bookmarkId) => chrome.bookmarks.remove(bookmarkId), id);
    },
    removeTree: async (id): Promise<void> => {
      const worker = await driverWorker(getBrowser());
      await worker.evaluate(async (bookmarkId) => chrome.bookmarks.removeTree(bookmarkId), id);
    },
  };
}
