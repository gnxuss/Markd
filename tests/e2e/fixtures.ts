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

export async function launchExtension(nodes: readonly SeedNode[]): Promise<ExtensionFixture> {
  const browser = await puppeteer.launch({ headless: true, enableExtensions: [extensionPath] });
  const worker = await extensionWorker(browser);
  const bookmarks = await worker.evaluate(async (seedNodes: readonly SeedNode[]) => {
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
  const libraryUrl = await worker.evaluate(() => chrome.runtime.getURL("library.html"));
  return {
    browser,
    worker,
    libraryUrl,
    bookmarks,
    openLibrary: async () => {
      const page = await browser.newPage();
      await page.goto(libraryUrl);
      return page;
    },
  };
}
