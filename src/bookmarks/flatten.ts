import type { BookmarkRow } from "../types.js";

export function flattenBookmarks(
  nodes: readonly chrome.bookmarks.BookmarkTreeNode[],
): readonly BookmarkRow[] {
  const rows: BookmarkRow[] = [];

  const visit = (
    children: readonly chrome.bookmarks.BookmarkTreeNode[],
    ancestors: readonly string[],
  ): void => {
    for (const node of children) {
      if (node.url !== undefined) {
        rows.push({
          id: node.id,
          title: node.title,
          url: node.url,
          tags: [],
          folderPath: ancestors.join(" / "),
        });
        continue;
      }
      const title = node.title.trim();
      visit(node.children ?? [], title.length === 0 ? ancestors : [...ancestors, title]);
    }
  };
  for (const root of nodes) visit(root.children ?? [], []);

  return rows;
}
