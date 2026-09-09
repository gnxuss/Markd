import puppeteer, { type Browser, type WebWorker } from "puppeteer";

type ExtensionRuntimeOptions = {
  readonly userDataDir: string;
  readonly extensionPath: string;
  readonly driverPath?: string;
  readonly distinguishExtension: boolean;
};

export type ExtensionRuntime = {
  readonly browser: Browser;
  readonly worker: WebWorker;
  readonly terminateWorker: () => Promise<void>;
  readonly reacquireWorker: () => Promise<WebWorker>;
  readonly restartWorker: (libraryUrl: string) => Promise<void>;
  readonly restartBrowser: () => Promise<void>;
  readonly close: () => Promise<void>;
};

async function findExtensionWorker(
  browser: Browser,
  name: string,
  distinguishExtension: boolean,
): Promise<WebWorker> {
  if (!distinguishExtension) {
    const target = await browser.waitForTarget(
      (candidate) => candidate.type() === "service_worker" && candidate.url().startsWith("chrome-extension://"),
    );
    const worker = await target.worker();
    if (worker === null) throw new TypeError("The extension service worker target had no worker context");
    return worker;
  }
  await browser.waitForTarget((candidate) => candidate.type() === "service_worker");
  const extension = [...(await browser.extensions()).values()].find((candidate) => candidate.name === name);
  if (extension === undefined) throw new TypeError(`Extension was not loaded: ${name}`);
  for (const existing of await extension.workers()) {
    try {
      if (await existing.evaluate(() => chrome.runtime.getManifest().name) === name) return existing;
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error;
    }
  }
  const target = await browser.waitForTarget(async (candidate) => {
    if (candidate.url() !== `chrome-extension://${extension.id}/background.js`) return false;
    const worker = await candidate.worker();
    if (worker === null) return false;
    try {
      return await worker.evaluate(() => chrome.runtime.getManifest().name) === name;
    } catch (error: unknown) {
      if (error instanceof Error) return false;
      throw error;
    }
  });
  const worker = await target.worker();
  if (worker === null) throw new TypeError("The extension service worker target had no worker context");
  return worker;
}

async function launchBrowser(options: ExtensionRuntimeOptions): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    enableExtensions: options.driverPath === undefined
      ? [options.extensionPath]
      : [options.extensionPath, options.driverPath],
    userDataDir: options.userDataDir,
  });
}

export async function launchExtensionRuntime(
  options: ExtensionRuntimeOptions,
): Promise<ExtensionRuntime> {
  let activeBrowser = await launchBrowser(options);
  let activeWorker = await findExtensionWorker(activeBrowser, "Markd", options.distinguishExtension);
  return {
    get browser(): Browser { return activeBrowser; },
    get worker(): WebWorker { return activeWorker; },
    terminateWorker: async (): Promise<void> => {
      await activeWorker.close();
      try {
        await activeWorker.evaluate(() => chrome.runtime.id);
      } catch (error: unknown) {
        if (error instanceof Error) return;
        throw error;
      }
      throw new TypeError("Markd worker did not terminate");
    },
    reacquireWorker: async (): Promise<WebWorker> => {
      activeWorker = await findExtensionWorker(activeBrowser, "Markd", true);
      return activeWorker;
    },
    restartWorker: async (libraryUrl): Promise<void> => {
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
      activeWorker = await findExtensionWorker(activeBrowser, "Markd", options.distinguishExtension);
    },
    restartBrowser: async (): Promise<void> => {
      await activeBrowser.close();
      activeBrowser = await launchBrowser(options);
      activeWorker = await findExtensionWorker(activeBrowser, "Markd", options.distinguishExtension);
    },
    close: async (): Promise<void> => {
      await activeBrowser.close();
    },
  };
}
