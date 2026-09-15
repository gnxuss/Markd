import type { Page } from "puppeteer";

import type { SeedNode } from "./fixtures.js";

export const BOOKMARK_COUNT = 2_000;

export const LARGE_LIBRARY = [
  ...Array.from({ length: BOOKMARK_COUNT - 1 }, (_, index) => ({
    kind: "bookmark" as const,
    key: `bookmark-${index}`,
    title: `Performance bookmark ${String(index).padStart(4, "0")}`,
    url: `https://performance.example/bookmark/${index}`,
  })),
  { kind: "folder", title: "Deep archive", children: [
    { kind: "folder", title: "Needle shelf", children: [
      {
        kind: "bookmark",
        key: "bookmark-1999",
        title: "Performance bookmark 1999",
        url: "https://performance.example/bookmark/1999",
      },
    ] },
  ] },
] satisfies readonly SeedNode[];

export type ReadCounts = {
  readonly bookmarks: string | undefined;
  readonly storage: string | undefined;
};

export type DomCounts = {
  readonly rows: number;
  readonly checkboxes: number;
  readonly elements: number;
};

export async function installReadCounters(page: Page): Promise<void> {
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
}

export async function resetReadCounters(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.documentElement.dataset["bookmarkReads"] = "0";
    document.documentElement.dataset["storageReads"] = "0";
  });
}

export async function readCounts(page: Page): Promise<ReadCounts> {
  return page.evaluate(() => ({
    bookmarks: document.documentElement.dataset["bookmarkReads"],
    storage: document.documentElement.dataset["storageReads"],
  }));
}

export async function domCounts(page: Page): Promise<DomCounts> {
  return page.evaluate(() => ({
    rows: document.querySelectorAll(".bookmark-row").length,
    checkboxes: document.querySelectorAll(".bookmark-selection input").length,
    elements: document.querySelectorAll("*").length,
  }));
}
