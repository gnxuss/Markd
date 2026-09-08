import type { BookmarkRow } from "../types.js";
import { flattenBookmarks } from "./flatten.js";

export async function loadBookmarkRows(): Promise<readonly BookmarkRow[]> {
  const tree = await chrome.bookmarks.getTree();
  return flattenBookmarks(tree);
}
