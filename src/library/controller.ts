import { openBookmark } from "../browser/open-tab.js";
import type {
  BookmarkLibrarySnapshot,
  BookmarkRow,
  LibraryState,
  RowOpenState,
  RowTagState,
  RetrievalCriteria,
  NoteAssignments,
  TagAssignments,
  TagRecord,
  LibraryView,
  NativeFolderNode,
} from "../types.js";
import { confirmedTagCatalog, selectRows } from "./selectors.js";
import { enrichBookmarkRow } from "./search-index.js";
import { createRowTagMutations } from "./row-tag-mutations.js";

export type BookmarkActivation = {
  readonly button: number;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly nestedInteractive: boolean;
  readonly preventDefault: () => void;
};

type LibrarySource =
  | { readonly loadLibrary: () => Promise<BookmarkLibrarySnapshot> }
  | { readonly loadRows: () => Promise<readonly BookmarkRow[]> };

type LibraryControllerDependencies = LibrarySource & {
  readonly loadTags?: (bookmarkIds: readonly string[]) => Promise<TagAssignments>;
  readonly loadNotes?: (bookmarkIds: readonly string[]) => Promise<NoteAssignments>;
  readonly writeTags?: (bookmarkId: string, tags: readonly TagRecord[]) => Promise<void>;
  readonly open?: (url: string, background: boolean) => Promise<void>;
  readonly render: (state: LibraryState) => void;
  readonly schedule?: (callback: () => void, duration: number) => void;
};

export type LibraryController = {
  readonly bootstrap: () => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly activate: (event: BookmarkActivation, row: BookmarkRow) => Promise<void>;
  readonly addTag: (bookmarkId: string, input: string) => Promise<void>;
  readonly removeTag: (bookmarkId: string, tagKey: string) => Promise<void>;
  readonly selectView: (view: LibraryView) => void;
  readonly setSearch: (query: string) => void;
  readonly toggleTagFilter: (tagKey: string) => void;
  readonly selectFolder: (folderId: string) => void;
  readonly clearFolder: () => void;
  readonly updateNote: (bookmarkId: string, note: string) => void;
  readonly getRows: () => readonly BookmarkRow[];
  readonly commitTags: (updates: Readonly<Record<string, readonly TagRecord[]>>) => void;
};

export function createLibraryController(
  dependencies: LibraryControllerDependencies,
): LibraryController {
  let rows: readonly BookmarkRow[] = [];
  let rowStates: Readonly<Record<string, RowOpenState>> = {};
  let tagStates: Readonly<Record<string, RowTagState>> = {};
  let view: LibraryView = "all";
  let criteria: RetrievalCriteria = { query: "", selectedTagKeys: [] };
  let folders: readonly NativeFolderNode[] = [];
  let selectedFolderId: string | undefined;
  const open = dependencies.open ?? openBookmark;
  const loadTags = dependencies.loadTags ?? (async (): Promise<TagAssignments> => ({}));
  const loadNotes = dependencies.loadNotes ?? (async (): Promise<NoteAssignments> => ({}));
  const writeTags = dependencies.writeTags ?? (async () => undefined);
  const schedule = dependencies.schedule ?? ((callback, duration) => window.setTimeout(callback, duration));
  const loadLibrary = "loadLibrary" in dependencies
    ? dependencies.loadLibrary
    : async (): Promise<BookmarkLibrarySnapshot> => ({ rows: await dependencies.loadRows(), folders: [] });

  function selectedFolderIds(): ReadonlySet<string> | undefined {
    if (selectedFolderId === undefined) return undefined;
    const ids = new Set<string>();
    const visit = (nodes: readonly NativeFolderNode[], collect: boolean): boolean => {
      for (const folder of nodes) {
        const matches = collect || folder.id === selectedFolderId;
        if (matches) ids.add(folder.id);
        if (visit(folder.children, matches) || folder.id === selectedFolderId) return true;
      }
      return false;
    };
    return visit(folders, false) ? ids : undefined;
  }

  async function refresh(): Promise<void> {
    try {
      const snapshot = await loadLibrary();
      folders = snapshot.folders;
      if (selectedFolderId !== undefined && selectedFolderIds() === undefined) selectedFolderId = undefined;
      const loadedRows = snapshot.rows;
      const ids = loadedRows.map((row) => row.id);
      const [assignments, notes] = await Promise.all([loadTags(ids), loadNotes(ids)]);
      const liveIds = new Set(loadedRows.map((row) => row.id));
      rows = loadedRows.map((row) => enrichBookmarkRow(row, assignments[row.id] ?? [], notes[row.id] ?? ""));
      rowStates = Object.fromEntries(Object.entries(rowStates).filter(([id]) => liveIds.has(id)));
      tagStates = Object.fromEntries(Object.entries(tagStates).filter(([id]) => liveIds.has(id)));
      if (rows.length === 0) dependencies.render({
        kind: "empty",
        folders,
        ...(selectedFolderId === undefined ? {} : { selectedFolderId }),
      });
      else renderReady();
    } catch (error: unknown) {
      if (error instanceof Error) {
        dependencies.render({ kind: "error", message: "Bookmarks could not be loaded." });
        return;
      }
      throw error;
    }
  }

  function renderReady(): void {
    const catalog = confirmedTagCatalog(rows);
    const availableTagKeys = new Set(catalog.map((tag) => tag.key));
    const selectedTagKeys = criteria.selectedTagKeys.filter((key) => availableTagKeys.has(key));
    if (selectedTagKeys.length !== criteria.selectedTagKeys.length) {
      criteria = { ...criteria, selectedTagKeys };
    }
    dependencies.render({
      kind: "ready",
      rows: selectRows(rows, view, criteria, selectedFolderIds()),
      view,
      query: criteria.query,
      selectedTagKeys: criteria.selectedTagKeys,
      catalog,
      rowStates,
      tagStates,
      folders,
      ...(selectedFolderId === undefined ? {} : { selectedFolderId }),
    });
    tagStates = Object.fromEntries(Object.entries(tagStates).map(([id, state]) => [id, { ...state, focus: false }]));
  }

  const tagMutations = createRowTagMutations({
    getRows: () => rows,
    setRows: (nextRows) => { rows = nextRows; },
    getStates: () => tagStates,
    setStates: (nextStates) => { tagStates = nextStates; },
    write: writeTags,
    render: renderReady,
  });

  return {
    bootstrap: async (): Promise<void> => {
      dependencies.render({ kind: "loading" });
      await refresh();
    },
    refresh,
    addTag: tagMutations.add,
    removeTag: tagMutations.remove,
    selectView: (nextView): void => {
      view = nextView;
      if (rows.length > 0) renderReady();
    },
    setSearch: (query): void => {
      criteria = { ...criteria, query };
      if (rows.length > 0) renderReady();
    },
    toggleTagFilter: (tagKey): void => {
      if (!confirmedTagCatalog(rows).some((tag) => tag.key === tagKey)) return;
      const selectedTagKeys = criteria.selectedTagKeys.includes(tagKey)
        ? criteria.selectedTagKeys.filter((key) => key !== tagKey)
        : [...criteria.selectedTagKeys, tagKey];
      criteria = { ...criteria, selectedTagKeys };
      if (rows.length > 0) renderReady();
    },
    selectFolder: (folderId): void => {
      const previous = selectedFolderId;
      selectedFolderId = folderId;
      if (selectedFolderIds() === undefined) {
        selectedFolderId = previous;
        return;
      }
      if (rows.length > 0) renderReady();
      else dependencies.render({ kind: "empty", folders, selectedFolderId });
    },
    clearFolder: (): void => {
      if (selectedFolderId === undefined) return;
      selectedFolderId = undefined;
      if (rows.length > 0) renderReady();
      else dependencies.render({ kind: "empty", folders });
    },
    updateNote: (bookmarkId, note): void => {
      rows = rows.map((row) => row.id === bookmarkId ? enrichBookmarkRow(row, row.tags, note) : row);
      if (rows.length > 0) renderReady();
    },
    getRows: () => rows,
    commitTags: (updates): void => {
      rows = rows.map((row) => {
        const tags = updates[row.id];
        return tags === undefined ? row : enrichBookmarkRow(row, tags, row.note ?? "");
      });
      if (rows.length > 0) renderReady();
    },
    activate: async (event, row): Promise<void> => {
      if (event.nestedInteractive || (event.button !== 0 && event.button !== 1)) return;
      event.preventDefault();
      const background = event.button === 1 || event.ctrlKey || event.metaKey;
      rowStates = { ...rowStates, [row.id]: { kind: "opening" } };
      renderReady();
      let failureMessage: string | undefined;
      try {
        await open(row.url, background);
      } catch (error: unknown) {
        if (error instanceof Error) {
          failureMessage = "Bookmark could not be opened.";
        } else {
          throw error;
        }
      } finally {
        const nextState = failureMessage === undefined
          ? { kind: "idle" as const }
          : { kind: "error" as const, message: failureMessage };
        rowStates = { ...rowStates, [row.id]: nextState };
        renderReady();
      }
      if (failureMessage !== undefined) {
        schedule(() => {
          const { [row.id]: _expired, ...remainingStates } = rowStates;
          rowStates = remainingStates;
          renderReady();
        }, 3_000);
      }
    },
  };
}
