import { describe, expect, it, vi } from "vitest";

import {
  collectUrlBookmarkIds,
  reconcileChangedMetadata,
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
    const removeNotes = vi.fn(async (_ids: readonly string[]) => undefined);

    await reconcileRemovedBookmark(removedTree, removeAssignments, removeNotes);
    await reconcileRemovedBookmark(removedTree, removeAssignments, removeNotes);

    expect(removeAssignments).toHaveBeenNthCalledWith(1, ["live-one", "live-two"]);
    expect(removeAssignments).toHaveBeenNthCalledWith(2, ["live-one", "live-two"]);
  });

  it("removes tag and note records for a deleted subtree without touching global metadata", async () => {
    // Given: exact tag and note removal adapters at the lifecycle seam.
    const removeAssignments = vi.fn(async (_ids: readonly string[]) => undefined);
    const removeNotes = vi.fn(async (_ids: readonly string[]) => undefined);

    // When: Chromium removes a folder subtree.
    await reconcileRemovedBookmark(removedTree, removeAssignments, removeNotes);

    // Then: both namespaces receive only URL-bearing native IDs.
    expect(removeAssignments).toHaveBeenCalledWith(["live-one", "live-two"]);
    expect(removeNotes).toHaveBeenCalledWith(["live-one", "live-two"]);
  });

  it("compares one native snapshot and removes only stale exact IDs", async () => {
    const loadTree = vi.fn(async () => tree);
    const listAssignmentIds = vi.fn(async () => ["live-one", "stale", "live-two"]);
    const removeAssignments = vi.fn(async (_ids: readonly string[]) => undefined);

    await reconcileStaleMetadata({ loadTree, listAssignmentIds, removeAssignments });

    expect(loadTree).toHaveBeenCalledTimes(1);
    expect(removeAssignments).toHaveBeenCalledWith(["stale"]);
  });

  it("reconciles the union of stale tag and note IDs from one native snapshot", async () => {
    // Given: independently owned tag and note namespaces with one shared stale ID.
    const loadTree = vi.fn(async () => tree);
    const removeAssignments = vi.fn(async (_ids: readonly string[]) => undefined);
    const removeNotes = vi.fn(async (_ids: readonly string[]) => undefined);

    // When: full metadata reconciliation runs.
    await reconcileStaleMetadata({
      loadTree,
      listAssignmentIds: async () => ["live-one", "tag-stale"],
      listNoteIds: async () => ["live-two", "note-stale", "tag-stale"],
      removeAssignments,
      removeNotes,
    });

    // Then: one tree read drives exact cleanup in each owning namespace.
    expect(loadTree).toHaveBeenCalledTimes(1);
    expect(removeAssignments).toHaveBeenCalledWith(["tag-stale"]);
    expect(removeNotes).toHaveBeenCalledWith(["note-stale", "tag-stale"]);
  });

  it("checks only changed assignment IDs against one native snapshot", async () => {
    const loadTree = vi.fn(async () => tree);
    const removeAssignments = vi.fn(async (_ids: readonly string[]) => undefined);

    await reconcileChangedMetadata(["live-one", "stale", "live-two"], {
      loadTree,
      removeAssignments,
    });

    expect(loadTree).toHaveBeenCalledTimes(1);
    expect(removeAssignments).toHaveBeenCalledWith(["stale"]);
  });
});
