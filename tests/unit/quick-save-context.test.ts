import { describe, expect, it } from "vitest";

import { deriveQuickSaveContext, parseActivePage } from "../../src/quick-save/context.js";

const tree: readonly chrome.bookmarks.BookmarkTreeNode[] = [{
  id: "0", title: "", syncing: false, children: [{
    id: "1", title: "Bookmarks bar", syncing: false, children: [{
      id: "folder", title: "Research", syncing: false, children: [{
        id: "existing", title: "Existing", url: "https://example.com/saved", syncing: false,
      }],
    }],
  }],
}];

describe("Quick Save context", () => {
  it("parses a bookmarkable active page when Chromium supplies an HTTP URL", () => {
    // Given: Chromium's active-tab result.
    const tab: chrome.tabs.Tab = { id: 7, index: 0, pinned: false, highlighted: true,
      windowId: 1, active: true, incognito: false, selected: true,
      discarded: false, autoDiscardable: true, groupId: -1,
      frozen: false, lastAccessed: 0,
      title: "Example", url: "https://example.com/new" };

    // When: the tab crosses the Quick Save boundary.
    const result = parseActivePage(tab);

    // Then: the untouched URL and useful display fields are retained.
    expect(result).toEqual({ kind: "ready", page: {
      title: "Example", url: "https://example.com/new", domain: "example.com",
    } });
  });

  it("rejects browser pages before any mutation can run", () => {
    // Given: an active browser-owned page.
    const tab: chrome.tabs.Tab = { id: 8, index: 0, pinned: false, highlighted: true,
      windowId: 1, active: true, incognito: false, selected: true,
      discarded: false, autoDiscardable: true, groupId: -1,
      frozen: false, lastAccessed: 0,
      title: "Extensions", url: "chrome://extensions" };

    // When: the boundary parser runs.
    const result = parseActivePage(tab);

    // Then: mutation remains unavailable with a useful reason.
    expect(result).toEqual({ kind: "error", message: "This page cannot be bookmarked." });
  });

  it("derives every real folder and exact matches from one depth-first tree", () => {
    // Given: one authoritative native tree and an active page.
    const page = { title: "Saved", url: "https://example.com/saved", domain: "example.com" };

    // When: the context is derived.
    const context = deriveQuickSaveContext(page, tree);

    // Then: synthetic root is excluded while native paths and exact IDs remain ordered.
    expect(context.folders).toEqual([
      { id: "1", label: "Bookmarks bar" },
      { id: "folder", label: "Bookmarks bar / Research" },
    ]);
    expect(context.matches.map((match) => match.id)).toEqual(["existing"]);
  });
});
