import { describe, expect, it, vi } from "vitest";

import {
  collectUrlBookmarkIds,
  reconcileRemovedBookmark,
  reconcileStaleMetadata,
} from "../../src/bookmarks/metadata-reconciliation.js";

const removedTree: chrome.bookmarks.BookmarkTreeNode = {
  id: "0",
  title: "root",
  syncing: false,
  children: [{
    id: "1",
    title: "folder",
    syncing: false,
    children: [
      { id: "live-one", title: "One", url: "https://one.example", syncing: false },
      { id: "nested", title: "Nested", syncing: false, children: [
        { id: "live-two", title: "Two", url: "https://two.example", syncing: false },
      ] },
    ],
  }],
};
const tree: readonly chrome.bookmarks.BookmarkTreeNode[] = [removedTree];

describe("bookmark metadata reconciliation", () => {
  it("collects only URL-bearing IDs from a recursively removed subtree", () => {
    expect(collectUrlBookmarkIds(removedTree)).toEqual(["live-one", "live-two"]);
  });

  it("removes every URL descendant from one recursive folder event", async () => {
    const removeAssignments = vi.fn(async (_ids: readonly string[]) => undefined);

    await reconcileRemovedBookmark(removedTree, removeAssignments);
    await reconcileRemovedBookmark(removedTree, removeAssignments);

    expect(removeAssignments).toHaveBeenNthCalledWith(1, ["live-one", "live-two"]);
    expect(removeAssignments).toHaveBeenNthCalledWith(2, ["live-one", "live-two"]);
  });

  it("compares one native snapshot and removes only stale exact IDs", async () => {
    const loadTree = vi.fn(async () => tree);
    const listAssignmentIds = vi.fn(async () => ["live-one", "stale", "live-two"]);
    const removeAssignments = vi.fn(async (_ids: readonly string[]) => undefined);

    await reconcileStaleMetadata({ loadTree, listAssignmentIds, removeAssignments });

    expect(loadTree).toHaveBeenCalledTimes(1);
    expect(removeAssignments).toHaveBeenCalledWith(["stale"]);
  });
});
