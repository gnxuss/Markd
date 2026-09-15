import { resolveTagInput } from "../tags/canonicalize.js";
import type { BookmarkRow, RowTagState, TagRecord } from "../types.js";
import { enrichBookmarkRow } from "./search-index.js";

type RowTagMutationDependencies = {
  readonly getRows: () => readonly BookmarkRow[];
  readonly setRows: (rows: readonly BookmarkRow[]) => void;
  readonly getStates: () => Readonly<Record<string, RowTagState>>;
  readonly setStates: (states: Readonly<Record<string, RowTagState>>) => void;
  readonly write: (bookmarkId: string, tags: readonly TagRecord[]) => Promise<void>;
  readonly render: () => void;
};

export type RowTagMutations = {
  readonly add: (bookmarkId: string, input: string) => Promise<void>;
  readonly remove: (bookmarkId: string, tagKey: string) => Promise<void>;
};

export function createRowTagMutations(
  dependencies: RowTagMutationDependencies,
): RowTagMutations {
  const queues = new Map<string, Promise<void>>();

  const updateState = (bookmarkId: string, state: RowTagState): void => {
    dependencies.setStates({ ...dependencies.getStates(), [bookmarkId]: state });
    dependencies.render();
  };

  const commit = (bookmarkId: string, tags: readonly TagRecord[]): void => {
    dependencies.setRows(dependencies.getRows().map((row) => row.id === bookmarkId
      ? enrichBookmarkRow(row, tags, row.note ?? "")
      : row));
  };

  async function performAdd(bookmarkId: string, input: string): Promise<void> {
    const rows = dependencies.getRows();
    const row = rows.find((candidate) => candidate.id === bookmarkId);
    if (row === undefined) return;
    const resolution = resolveTagInput(input, rows.flatMap((candidate) => candidate.tags));
    if (resolution.kind === "invalid") {
      updateState(bookmarkId, { kind: "error", input, focus: false, message: "Enter a tag name." });
      return;
    }
    if (row.tags.some((candidate) => candidate.key === resolution.tag.key)) {
      updateState(bookmarkId, { kind: "idle", input: "", focus: true });
      return;
    }
    const nextTags = [...row.tags, resolution.tag];
    updateState(bookmarkId, { kind: "saving", input, focus: false });
    try {
      await dependencies.write(bookmarkId, nextTags);
    } catch (error: unknown) {
      if (error instanceof Error) {
        updateState(bookmarkId, { kind: "error", input, focus: false, message: "Tag could not be saved." });
        return;
      }
      updateState(bookmarkId, { kind: "idle", input, focus: false });
      throw error;
    }
    commit(bookmarkId, nextTags);
    updateState(bookmarkId, { kind: "idle", input: "", focus: true });
  }

  async function performRemove(bookmarkId: string, tagKey: string): Promise<void> {
    const row = dependencies.getRows().find((candidate) => candidate.id === bookmarkId);
    if (row === undefined || !row.tags.some((tag) => tag.key === tagKey)) return;
    const input = dependencies.getStates()[bookmarkId]?.input ?? "";
    const nextTags = row.tags.filter((tag) => tag.key !== tagKey);
    updateState(bookmarkId, { kind: "saving", input, focus: false });
    try {
      await dependencies.write(bookmarkId, nextTags);
    } catch (error: unknown) {
      if (error instanceof Error) {
        updateState(bookmarkId, { kind: "error", input, focus: false, message: "Tag could not be removed." });
        return;
      }
      updateState(bookmarkId, { kind: "idle", input, focus: false });
      throw error;
    }
    commit(bookmarkId, nextTags);
    updateState(bookmarkId, { kind: "idle", input, focus: false });
  }

  async function enqueue(bookmarkId: string, operation: () => Promise<void>): Promise<void> {
    const previous = queues.get(bookmarkId);
    const current = previous === undefined ? operation() : previous.catch(() => undefined).then(operation);
    queues.set(bookmarkId, current);
    try {
      await current;
    } finally {
      if (queues.get(bookmarkId) === current) queues.delete(bookmarkId);
    }
  }

  return {
    add: async (bookmarkId, input): Promise<void> => enqueue(bookmarkId, () => performAdd(bookmarkId, input)),
    remove: async (bookmarkId, tagKey): Promise<void> => enqueue(bookmarkId, () => performRemove(bookmarkId, tagKey)),
  };
}
