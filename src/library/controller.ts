import { openBookmark } from "../browser/open-tab.js";
import { resolveTagInput } from "../tags/canonicalize.js";
import type {
  BookmarkRow,
  LibraryState,
  RowOpenState,
  RowTagState,
  RetrievalCriteria,
  NoteAssignments,
  TagAssignments,
  TagRecord,
  LibraryView,
} from "../types.js";
import { confirmedTagCatalog, selectRows } from "./selectors.js";
import { enrichBookmarkRow } from "./search-index.js";

export type BookmarkActivation = {
  readonly button: number;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly nestedInteractive: boolean;
  readonly preventDefault: () => void;
};

type LibraryControllerDependencies = {
  readonly loadRows: () => Promise<readonly BookmarkRow[]>;
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
  readonly updateNote: (bookmarkId: string, note: string) => void;
};

export function createLibraryController(
  dependencies: LibraryControllerDependencies,
): LibraryController {
  let rows: readonly BookmarkRow[] = [];
  let rowStates: Readonly<Record<string, RowOpenState>> = {};
  let tagStates: Readonly<Record<string, RowTagState>> = {};
  let view: LibraryView = "all";
  let criteria: RetrievalCriteria = { query: "", selectedTagKeys: [] };
  const open = dependencies.open ?? openBookmark;
  const loadTags = dependencies.loadTags ?? (async (): Promise<TagAssignments> => ({}));
  const loadNotes = dependencies.loadNotes ?? (async (): Promise<NoteAssignments> => ({}));
  const writeTags = dependencies.writeTags ?? (async () => undefined);
  const schedule = dependencies.schedule ?? ((callback, duration) => window.setTimeout(callback, duration));
  const tagWriteQueues = new Map<string, Promise<void>>();

  async function refresh(): Promise<void> {
    try {
      const loadedRows = await dependencies.loadRows();
      const ids = loadedRows.map((row) => row.id);
      const [assignments, notes] = await Promise.all([loadTags(ids), loadNotes(ids)]);
      const liveIds = new Set(loadedRows.map((row) => row.id));
      rows = loadedRows.map((row) => enrichBookmarkRow(
        row,
        assignments[row.id] ?? [],
        notes[row.id] ?? "",
      ));
      rowStates = Object.fromEntries(Object.entries(rowStates).filter(([id]) => liveIds.has(id)));
      tagStates = Object.fromEntries(Object.entries(tagStates).filter(([id]) => liveIds.has(id)));
      if (rows.length === 0) dependencies.render({ kind: "empty" });
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
      rows: selectRows(rows, view, criteria),
      view,
      query: criteria.query,
      selectedTagKeys: criteria.selectedTagKeys,
      catalog,
      rowStates,
      tagStates,
    });
    tagStates = Object.fromEntries(
      Object.entries(tagStates).map(([id, state]) => [id, { ...state, focus: false }]),
    );
  }

  async function performAddTag(bookmarkId: string, input: string): Promise<void> {
    const row = rows.find((candidate) => candidate.id === bookmarkId);
    if (row === undefined) return;
    const resolution = resolveTagInput(input, rows.flatMap((candidate) => candidate.tags));
    if (resolution.kind === "invalid") {
      tagStates = {
        ...tagStates,
        [bookmarkId]: { kind: "error", input, focus: false, message: "Enter a tag name." },
      };
      renderReady();
      return;
    }
    if (row.tags.some((candidate) => candidate.key === resolution.tag.key)) {
      tagStates = { ...tagStates, [bookmarkId]: { kind: "idle", input: "", focus: true } };
      renderReady();
      return;
    }
    const nextTags = [...row.tags, resolution.tag];
    tagStates = { ...tagStates, [bookmarkId]: { kind: "saving", input, focus: false } };
    renderReady();
    try {
      await writeTags(bookmarkId, nextTags);
    } catch (error: unknown) {
      if (error instanceof Error) {
        tagStates = {
          ...tagStates,
          [bookmarkId]: { kind: "error", input, focus: false, message: "Tag could not be saved." },
        };
        renderReady();
        return;
      }
      tagStates = { ...tagStates, [bookmarkId]: { kind: "idle", input, focus: false } };
      renderReady();
      throw error;
    }
    rows = rows.map((candidate) => candidate.id === bookmarkId
      ? enrichBookmarkRow(candidate, nextTags, candidate.note ?? "")
      : candidate);
    tagStates = { ...tagStates, [bookmarkId]: { kind: "idle", input: "", focus: true } };
    renderReady();
  }

  async function performRemoveTag(bookmarkId: string, tagKey: string): Promise<void> {
    const row = rows.find((candidate) => candidate.id === bookmarkId);
    if (row === undefined || !row.tags.some((tag) => tag.key === tagKey)) return;
    const input = tagStates[bookmarkId]?.input ?? "";
    const nextTags = row.tags.filter((tag) => tag.key !== tagKey);
    tagStates = { ...tagStates, [bookmarkId]: { kind: "saving", input, focus: false } };
    renderReady();
    try {
      await writeTags(bookmarkId, nextTags);
    } catch (error: unknown) {
      if (error instanceof Error) {
        tagStates = {
          ...tagStates,
          [bookmarkId]: { kind: "error", input, focus: false, message: "Tag could not be removed." },
        };
        renderReady();
        return;
      }
      tagStates = { ...tagStates, [bookmarkId]: { kind: "idle", input, focus: false } };
      renderReady();
      throw error;
    }
    rows = rows.map((candidate) => candidate.id === bookmarkId
      ? enrichBookmarkRow(candidate, nextTags, candidate.note ?? "")
      : candidate);
    tagStates = { ...tagStates, [bookmarkId]: { kind: "idle", input, focus: false } };
    renderReady();
  }

  async function enqueueTagMutation(bookmarkId: string, operation: () => Promise<void>): Promise<void> {
    const previous = tagWriteQueues.get(bookmarkId);
    const current = previous === undefined
      ? operation()
      : previous.catch(() => undefined).then(operation);
    tagWriteQueues.set(bookmarkId, current);
    try {
      await current;
    } finally {
      if (tagWriteQueues.get(bookmarkId) === current) tagWriteQueues.delete(bookmarkId);
    }
  }

  return {
    bootstrap: async (): Promise<void> => {
      dependencies.render({ kind: "loading" });
      await refresh();
    },
    refresh,
    addTag: async (bookmarkId, input): Promise<void> => {
      await enqueueTagMutation(bookmarkId, () => performAddTag(bookmarkId, input));
    },
    removeTag: async (bookmarkId, tagKey): Promise<void> => {
      await enqueueTagMutation(bookmarkId, () => performRemoveTag(bookmarkId, tagKey));
    },
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
    updateNote: (bookmarkId, note): void => {
      rows = rows.map((row) => row.id === bookmarkId
        ? enrichBookmarkRow(row, row.tags, note)
        : row);
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
