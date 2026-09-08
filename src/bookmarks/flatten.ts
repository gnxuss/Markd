import type { BookmarkRow } from "../types.js";

export function flattenBookmarks(
  nodes: readonly chrome.bookmarks.BookmarkTreeNode[],
): readonly BookmarkRow[] {
  const rows: BookmarkRow[] = [];

  for (const node of nodes) {
    if (node.url !== undefined) {
      rows.push({ id: node.id, title: node.title, url: node.url, tags: [] });
    }
    rows.push(...flattenBookmarks(node.children ?? []));
  }

  return rows;
}
