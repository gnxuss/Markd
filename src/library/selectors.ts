import type { BookmarkRow, LibraryView, RetrievalCriteria, TagRecord } from "../types.js";

export function selectRows(
  rows: readonly BookmarkRow[],
  view: LibraryView,
  criteria: RetrievalCriteria = { query: "", selectedTagKeys: [] },
  allowedFolderIds?: ReadonlySet<string>,
): readonly BookmarkRow[] {
  const query = criteria.query.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    if (allowedFolderIds !== undefined && (row.folderId === undefined || !allowedFolderIds.has(row.folderId))) return false;
    if (view === "untagged" && row.tags.length > 0) return false;
    const searchable = row.searchText
      ?? `${row.title}\n${row.url}\n${row.folderPath ?? ""}\n${row.tags.map((tag) => `${tag.label}\n${tag.key}`).join("\n")}\n${row.note ?? ""}`.toLocaleLowerCase();
    if (query.length > 0 && !searchable.includes(query)) return false;
    return criteria.selectedTagKeys.every((key) => row.tags.some((tag) => tag.key === key));
  });
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
