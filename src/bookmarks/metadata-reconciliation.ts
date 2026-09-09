import {
  listBookmarkTagIds,
  removeBookmarkTagAssignments,
} from "../tags/chrome-tag-storage.js";

export type MetadataReconciliationDependencies = {
  readonly loadTree: () => Promise<readonly chrome.bookmarks.BookmarkTreeNode[]>;
  readonly listAssignmentIds: () => Promise<readonly string[]>;
  readonly removeAssignments: (bookmarkIds: readonly string[]) => Promise<void>;
};

const defaultDependencies: MetadataReconciliationDependencies = {
  loadTree: () => chrome.bookmarks.getTree(),
  listAssignmentIds: listBookmarkTagIds,
  removeAssignments: removeBookmarkTagAssignments,
};

export function collectUrlBookmarkIds(
  node: chrome.bookmarks.BookmarkTreeNode,
): readonly string[] {
  const ownId = node.url === undefined ? [] : [node.id];
  return [
    ...ownId,
    ...(node.children ?? []).flatMap((child) => collectUrlBookmarkIds(child)),
  ];
}

export async function reconcileRemovedBookmark(
  removedNode: chrome.bookmarks.BookmarkTreeNode,
  removeAssignments: (bookmarkIds: readonly string[]) => Promise<void> = removeBookmarkTagAssignments,
): Promise<void> {
  await removeAssignments(collectUrlBookmarkIds(removedNode));
}

export async function reconcileStaleMetadata(
  dependencies: MetadataReconciliationDependencies = defaultDependencies,
): Promise<void> {
  const [tree, assignmentIds] = await Promise.all([
    dependencies.loadTree(),
    dependencies.listAssignmentIds(),
  ]);
  const liveIds = new Set(tree.flatMap((root) => collectUrlBookmarkIds(root)));
  await dependencies.removeAssignments(assignmentIds.filter((id) => !liveIds.has(id)));
}
