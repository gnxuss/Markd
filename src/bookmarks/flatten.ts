import type { BookmarkLibrarySnapshot, BookmarkRow, NativeFolderNode } from "../types.js";

export function projectBookmarkLibrary(
  nodes: readonly chrome.bookmarks.BookmarkTreeNode[],
): BookmarkLibrarySnapshot {
  const rows: BookmarkRow[] = [];

  const projectFolder = (
    node: chrome.bookmarks.BookmarkTreeNode,
    ancestors: readonly string[],
  ): NativeFolderNode => {
    const title = node.title.trim();
    const path = title.length === 0 ? ancestors : [...ancestors, title];
    const children: NativeFolderNode[] = [];
    for (const child of node.children ?? []) {
      if (child.url === undefined) {
        children.push(projectFolder(child, path));
      } else {
        rows.push({
          id: child.id,
          title: child.title,
          url: child.url,
          tags: [],
          folderId: node.id,
          folderPath: path.join(" / "),
        });
      }
    }
    return { id: node.id, title: node.title, children };
  };

  const folders: NativeFolderNode[] = [];
  for (const root of nodes) {
    if (root.url !== undefined) {
      rows.push({ id: root.id, title: root.title, url: root.url, tags: [], folderPath: "" });
      continue;
    }
    for (const child of root.children ?? []) {
      if (child.url === undefined) {
        folders.push(projectFolder(child, []));
      } else {
        rows.push({ id: child.id, title: child.title, url: child.url, tags: [], folderPath: "" });
      }
    }
  }
  return { rows, folders };
}

export function flattenBookmarks(
  nodes: readonly chrome.bookmarks.BookmarkTreeNode[],
): readonly BookmarkRow[] {
  return projectBookmarkLibrary(nodes).rows.map(({ folderId: _folderId, ...row }) => row);
}
