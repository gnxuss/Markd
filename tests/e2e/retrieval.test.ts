import { afterEach, describe, expect, it } from "vitest";

import { launchExtension, type ExtensionFixture } from "./fixtures.js";

let fixture: ExtensionFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

describe("unified retrieval built Chromium", () => {
  it("searches title and URL, filters by one confirmed tag, and keeps editing usable", async () => {
    fixture = await launchExtension([
      { kind: "bookmark", key: "alpha", title: "Alpha Handbook", url: "https://docs.example.com/guide" },
      { kind: "bookmark", key: "beta", title: "Beta Notes", url: "https://research.example.org/archive" },
      { kind: "bookmark", key: "gamma", title: "Gamma", url: "https://other.example.net/path" },
    ]);
    const page = await fixture.openLibrary();
    const row = (key: string): string => `[data-bookmark-id="${fixture?.bookmarks[key]?.id}"]`;

    await page.type(`${row("alpha")} .tag-input`, "Design");
    await page.keyboard.press("Enter");
    await page.waitForSelector(`${row("alpha")} .tag-chip`);
    await page.type(`${row("beta")} .tag-input`, "Design");
    await page.keyboard.press("Enter");
    await page.waitForSelector(`${row("beta")} .tag-chip`);

    await page.type("#bookmark-search", "ALPHA");
    expect(await page.$$(".bookmark-row")).toHaveLength(1);
    expect(await page.$(row("alpha"))).not.toBeNull();
    await page.focus("#bookmark-search");
    await page.keyboard.press("Control+A");
    await page.type("#bookmark-search", "research.example.org/ARCH");
    expect(await page.$$(".bookmark-row")).toHaveLength(1);
    expect(await page.$(row("beta"))).not.toBeNull();

    await page.focus("#bookmark-search");
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await page.click('[data-tag-key="design"]');
    expect(await page.$eval('[data-tag-key="design"]', (element) => element.getAttribute("aria-pressed"))).toBe("true");
    expect(await page.$$(".bookmark-row")).toHaveLength(2);

    await page.click("#untagged-view");
    expect(await page.$$(".bookmark-row")).toHaveLength(0);
    await page.click("#all-view");
    await page.type(`${row("alpha")} .tag-input`, "Reference");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      (selector) => document.querySelectorAll(`${selector} .tag-chip`).length === 2,
      {},
      row("alpha"),
    );
    expect(await page.$eval('[data-tag-key="design"]', (element) => element.getAttribute("aria-pressed"))).toBe("true");
    expect(await fixture.browser.pages()).toHaveLength(2);
  }, 30_000);
});
