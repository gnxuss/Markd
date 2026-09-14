import { describe, expect, it } from "vitest";

import { flattenBookmarks } from "../../src/bookmarks/flatten.js";
import { folderOnlyTree, phaseOneBookmarkTree } from "../fixtures/bookmark-tree.js";

describe("flattenBookmarks", () => {
  it("returns no rows when the input is empty or contains only folders", () => {
    const emptyAndFolderInputs = [[], folderOnlyTree] as const;
    const projectedRows = emptyAndFolderInputs.map((nodes) => flattenBookmarks(nodes));
    expect(projectedRows).toEqual([[], []]);
  });

  it("keeps a URL-bearing node supplied directly at the traversal boundary", () => {
    const direct = phaseOneBookmarkTree[0]?.children?.find((node) => node.id === "first");
    if (direct === undefined) throw new TypeError("Direct bookmark fixture unavailable");
    expect(flattenBookmarks([direct])).toEqual([{
      id: "first",
      title: "First",
      url: "https://www.example.com/first/long/path",
      tags: [],
      folderPath: "",
    }]);
  });

  it("keeps every URL node in depth-first native order across empty folders", () => {
    const projectedRows = flattenBookmarks(phaseOneBookmarkTree);
    expect(projectedRows.map(({ id }) => id)).toEqual([
      "first",
      "second",
      "blank",
      "duplicate",
      "last",
    ]);
  });

  it("preserves native identity fields and keeps duplicate URLs as separate rows", () => {
    const projectedRows = flattenBookmarks(phaseOneBookmarkTree);
    expect(projectedRows).toContainEqual({
      id: "second",
      title: "Second",
      url: "https://duplicate.example/item",
      tags: [],
      folderPath: "",
    });
    expect(projectedRows).toContainEqual({
      id: "duplicate",
      title: "Duplicate",
      url: "https://duplicate.example/item",
      tags: [],
      folderPath: "Nested / Deep",
    });
  });

  it("projects every named ancestor folder without including the synthetic root", () => {
    const projectedRows = flattenBookmarks(phaseOneBookmarkTree);
    expect(projectedRows.find((row) => row.id === "duplicate")?.folderPath).toBe("Nested / Deep");
    expect(projectedRows.find((row) => row.id === "first")?.folderPath).toBe("");
  });
});
