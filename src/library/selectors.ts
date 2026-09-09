import type { BookmarkRow, LibraryView, TagRecord } from "../types.js";

export function selectRows(
  rows: readonly BookmarkRow[],
  view: LibraryView,
): readonly BookmarkRow[] {
  return view === "all" ? rows : rows.filter((row) => row.tags.length === 0);
}

export function confirmedTagCatalog(rows: readonly BookmarkRow[]): readonly TagRecord[] {
  const catalog = new Map<string, TagRecord>();
  for (const row of rows) {
    for (const tag of row.tags) {
      if (!catalog.has(tag.key)) catalog.set(tag.key, tag);
    }
  }
  return Array.from(catalog.values());
}
