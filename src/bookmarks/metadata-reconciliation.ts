import {
  listBookmarkTagIds,
  removeBookmarkTagAssignments,
} from "../tags/chrome-tag-storage.js";
import {
  listBookmarkNoteIds,
  removeBookmarkNotes,
} from "../quick-save/metadata-storage.js";

export type MetadataReconciliationDependencies = {
  readonly loadTree: () => Promise<readonly chrome.bookmarks.BookmarkTreeNode[]>;
  readonly listAssignmentIds: () => Promise<readonly string[]>;
  readonly removeAssignments: (bookmarkIds: readonly string[]) => Promise<void>;
  readonly listNoteIds?: () => Promise<readonly string[]>;
  readonly removeNotes?: (bookmarkIds: readonly string[]) => Promise<void>;
};

export type ChangedMetadataDependencies = Pick<
  MetadataReconciliationDependencies,
  "loadTree" | "removeAssignments" | "removeNotes"
>;

const defaultDependencies: MetadataReconciliationDependencies = {
  loadTree: () => chrome.bookmarks.getTree(),
  listAssignmentIds: listBookmarkTagIds,
  removeAssignments: removeBookmarkTagAssignments,
  listNoteIds: listBookmarkNoteIds,
  removeNotes: removeBookmarkNotes,
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
  removeNotes: (bookmarkIds: readonly string[]) => Promise<void> = removeBookmarkNotes,
): Promise<void> {
  const ids = collectUrlBookmarkIds(removedNode);
  await Promise.all([removeAssignments(ids), removeNotes(ids)]);
}

export async function reconcileStaleMetadata(
  dependencies: MetadataReconciliationDependencies = defaultDependencies,
): Promise<void> {
  const [tree, assignmentIds, noteIds] = await Promise.all([
    dependencies.loadTree(),
    dependencies.listAssignmentIds(),
    dependencies.listNoteIds?.() ?? Promise.resolve([]),
  ]);
  const liveIds = new Set(tree.flatMap((root) => collectUrlBookmarkIds(root)));
  await Promise.all([
    dependencies.removeAssignments(assignmentIds.filter((id) => !liveIds.has(id))),
    dependencies.removeNotes?.(noteIds.filter((id) => !liveIds.has(id))) ?? Promise.resolve(),
  ]);
}

export async function reconcileChangedMetadata(
  changedIds: readonly string[],
  dependencies: ChangedMetadataDependencies = defaultDependencies,
): Promise<void> {
  if (changedIds.length === 0) return;
  const tree = await dependencies.loadTree();
  const liveIds = new Set(tree.flatMap((root) => collectUrlBookmarkIds(root)));
  const staleIds = [...new Set(changedIds)].filter((id) => !liveIds.has(id));
  if (staleIds.length > 0) await dependencies.removeAssignments(staleIds);
  if (staleIds.length > 0) await dependencies.removeNotes?.(staleIds);
}
