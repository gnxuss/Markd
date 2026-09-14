import type { BookmarkRow, TagRecord } from "../types.js";

export function enrichBookmarkRow(
  row: BookmarkRow,
  tags: readonly TagRecord[],
  note: string,
): BookmarkRow {
  const searchText = [
    row.title,
    row.url,
    row.folderPath ?? "",
    ...tags.flatMap((tag) => [tag.label, tag.key]),
    note,
  ].join("\n").toLocaleLowerCase();
  return { ...row, tags, note, searchText };
}
