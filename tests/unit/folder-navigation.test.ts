import { describe, expect, it } from "vitest";

import { projectBookmarkLibrary } from "../../src/bookmarks/flatten.js";
import { selectRows } from "../../src/library/selectors.js";
import type { BookmarkRow, NativeFolderNode } from "../../src/types.js";

const nestedTree: readonly chrome.bookmarks.BookmarkTreeNode[] = [{
  id: "root",
  syncing: false,
  title: "",
  children: [
    {
      id: "work",
      syncing: false,
      title: "Work",
      children: [
        { id: "work-direct", syncing: false, title: "Direct", url: "https://duplicate.example/item" },
        {
          id: "reports-a",
          syncing: false,
          title: "Reports",
          children: [{
            id: "deep",
            syncing: false,
            title: "Deep",
            children: [{ id: "work-deep", syncing: false, title: "Deep item", url: "https://deep.example/item" }],
          }],
        },
        { id: "empty", syncing: false, title: "Empty", children: [] },
      ],
    },
    {
      id: "reports-b",
      syncing: false,
      title: "Reports",
      children: [{ id: "sibling", syncing: false, title: "Sibling", url: "https://duplicate.example/item" }],
    },
  ],
}];

function descendantIds(folder: NativeFolderNode): ReadonlySet<string> {
  const ids = new Set<string>();
  const visit = (node: NativeFolderNode): void => {
    ids.add(node.id);
    for (const child of node.children) visit(child);
  };
  visit(folder);
  return ids;
}

describe("native folder projection", () => {
  it("preserves ordered empty and same-title folders by native ID", () => {
    // Given: a native tree with nested, empty, and same-title sibling folders.
    // When: one snapshot is projected.
    const snapshot = projectBookmarkLibrary(nestedTree);

    // Then: the synthetic root is hidden and every actual folder remains distinct.
    expect(snapshot.folders.map(({ id }) => id)).toEqual(["work", "reports-b"]);
    expect(snapshot.folders[0]?.children.map(({ id }) => id)).toEqual(["reports-a", "empty"]);
    expect(snapshot.folders[0]?.children[0]?.children.map(({ id }) => id)).toEqual(["deep"]);
    expect(snapshot.folders[0]?.children[1]).toMatchObject({ id: "empty", children: [] });
  });

  it("assigns direct folder IDs while preserving bookmark order and duplicate URLs", () => {
    // Given: duplicate URLs in separate native subtrees.
    // When: bookmark rows are projected from the tree.
    const rows = projectBookmarkLibrary(nestedTree).rows;

    // Then: native bookmark identity and direct folder membership remain independent.
    expect(rows.map(({ id }) => id)).toEqual(["work-direct", "work-deep", "sibling"]);
    expect(rows.map(({ folderId }) => folderId)).toEqual(["work", "deep", "reports-b"]);
    expect(rows[0]?.url).toBe(rows[2]?.url);
  });
});

describe("native folder selection", () => {
  it("includes direct and descendant bookmarks but excludes sibling subtrees", () => {
    // Given: the Work folder's native descendant ID set.
    const snapshot = projectBookmarkLibrary(nestedTree);
    const work = snapshot.folders[0];
    if (work === undefined) throw new TypeError("Work folder fixture unavailable");

    // When: rows are selected using structured folder identity.
    const selected = selectRows(snapshot.rows, "all", { query: "", selectedTagKeys: [] }, descendantIds(work));

    // Then: direct and deep rows match without including the same-URL sibling.
    expect(selected.map(({ id }) => id)).toEqual(["work-direct", "work-deep"]);
  });

  it("composes folder, view, query, and every-tag predicates", () => {
    // Given: enriched rows spanning the selected folder subtree and a sibling.
    const rows = [
      { id: "direct", title: "Guide", url: "https://example.com/guide", folderId: "work", tags: [] },
      { id: "match", title: "Deep guide", url: "https://example.com/deep", folderId: "deep", tags: [
        { key: "design", label: "Design" },
        { key: "research", label: "Research" },
      ] },
      { id: "sibling", title: "Deep guide", url: "https://example.com/other", folderId: "reports-b", tags: [
        { key: "design", label: "Design" },
        { key: "research", label: "Research" },
      ] },
    ] satisfies readonly BookmarkRow[];

    // When: every retrieval criterion is active.
    const selected = selectRows(
      rows,
      "all",
      { query: "deep", selectedTagKeys: ["design", "research"] },
      new Set(["work", "reports-a", "deep", "empty"]),
    );

    // Then: only the row satisfying all predicates remains in source order.
    expect(selected.map(({ id }) => id)).toEqual(["match"]);
    expect(selectRows(rows, "untagged", { query: "guide", selectedTagKeys: [] }, new Set(["work"])))
      .toEqual([rows[0]]);
    expect(selectRows(rows, "all", { query: "", selectedTagKeys: [] }, new Set())).toEqual([]);
  });
});
