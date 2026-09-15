import type { BookmarkLibrarySnapshot, BookmarkRow } from "../types.js";
import { projectBookmarkLibrary } from "./flatten.js";

export async function loadBookmarkLibrary(): Promise<BookmarkLibrarySnapshot> {
  const tree = await chrome.bookmarks.getTree();
  return projectBookmarkLibrary(tree);
}

export async function loadBookmarkRows(): Promise<readonly BookmarkRow[]> {
  return (await loadBookmarkLibrary()).rows;
}
