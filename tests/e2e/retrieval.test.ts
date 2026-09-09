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
    await page.click("#bookmark-search", { count: 3 });
    await page.type("#bookmark-search", "research.example.org/ARCH");
    expect(await page.$$(".bookmark-row")).toHaveLength(1);
    expect(await page.$(row("beta"))).not.toBeNull();

    await page.click("#bookmark-search", { count: 3 });
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

  it("combines two tag filters with search using AND semantics", async () => {
    fixture = await launchExtension([
      { kind: "bookmark", key: "alpha", title: "Alpha Guide", url: "https://docs.example.com/start" },
      { kind: "bookmark", key: "beta", title: "Beta Guide", url: "https://research.example.org/archive" },
      { kind: "bookmark", key: "gamma", title: "Gamma", url: "https://other.example.net/path" },
    ]);
    const page = await fixture.openLibrary();
    const row = (key: string): string => `[data-bookmark-id="${fixture?.bookmarks[key]?.id}"]`;
    const add = async (key: string, label: string): Promise<void> => {
      await page.type(`${row(key)} .tag-input`, label);
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        (selector, expected) => Array.from(document.querySelectorAll(`${selector} .tag-chip > span`))
          .some((element) => element.textContent === expected),
        {},
        row(key),
        label,
      );
    };
    await add("alpha", "Design");
    await add("alpha", "Research");
    await add("beta", "Design");

    await page.click('[data-tag-key="design"]');
    await page.click('[data-tag-key="research"]');
    expect(await page.$$(".bookmark-row")).toHaveLength(1);
    expect(await page.$(row("alpha"))).not.toBeNull();

    await page.type("#bookmark-search", "DOCS.EXAMPLE");
    expect(await page.$$(".bookmark-row")).toHaveLength(1);
    await page.click("#untagged-view");
    expect(await page.$$(".bookmark-row")).toHaveLength(0);
    await page.click("#all-view");
    expect(await page.$(row("alpha"))).not.toBeNull();

    await page.click(`${row("alpha")} [aria-label="Remove Research"]`);
    await page.waitForFunction(() => document.querySelector('[data-tag-key="research"]') === null);
    expect(await page.$eval('[data-tag-key="design"]', (element) => element.getAttribute("aria-pressed"))).toBe("true");
    expect(await page.$(row("alpha"))).not.toBeNull();
  }, 30_000);
});
