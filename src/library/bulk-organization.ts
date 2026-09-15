import type { BookmarkRow, TagRecord } from "../types.js";
import type { NativeFolderNode } from "../types.js";
import type { BookmarkMoving, FolderDestination } from "./bookmark-moving.js";

export type BulkOperation = "add" | "remove";
export type BulkStatus = "idle" | "saving" | "error" | "success";

export type BulkOrganizationState = {
  readonly mode: boolean;
  readonly selectedIds: readonly string[];
  readonly stagedTags: readonly TagRecord[];
  readonly status: BulkStatus;
  readonly message: string;
  readonly destinationId: string;
};

type BulkOrganizationDependencies = {
  readonly rows: () => readonly BookmarkRow[];
  readonly write: (bookmarkId: string, tags: readonly TagRecord[]) => Promise<void>;
  readonly commit: (updates: Readonly<Record<string, readonly TagRecord[]>>) => void;
  readonly onState: () => void;
  readonly folders?: () => readonly NativeFolderNode[];
  readonly moving?: BookmarkMoving;
};

export type BulkOrganization = {
  readonly state: () => BulkOrganizationState;
  readonly enter: () => void;
  readonly exit: () => void;
  readonly toggle: (bookmarkId: string) => void;
  readonly clear: () => void;
  readonly retain: (bookmarkIds: readonly string[]) => void;
  readonly stage: (tag: TagRecord) => void;
  readonly unstage: (tagKey: string) => void;
  readonly apply: (operation: BulkOperation) => Promise<void>;
  readonly moveDestinations: () => readonly FolderDestination[];
  readonly setDestination: (destinationId: string) => void;
  readonly move: () => Promise<void>;
  readonly dispose: () => void;
};

function transformTags(
  current: readonly TagRecord[],
  staged: readonly TagRecord[],
  operation: BulkOperation,
): readonly TagRecord[] {
  if (operation === "remove") {
    const keys = new Set(staged.map((tag) => tag.key));
    return current.filter((tag) => !keys.has(tag.key));
  }
  const tags = [...current];
  const keys = new Set(current.map((tag) => tag.key));
  for (const tag of staged) {
    if (!keys.has(tag.key)) {
      tags.push(tag);
      keys.add(tag.key);
    }
  }
  return tags;
}

function tagsEqual(left: readonly TagRecord[], right: readonly TagRecord[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag.key === right[index]?.key);
}

export function createBulkOrganization(
  dependencies: BulkOrganizationDependencies,
): BulkOrganization {
  let mode = false;
  let selectedIds: readonly string[] = [];
  let stagedTags: readonly TagRecord[] = [];
  let status: BulkStatus = "idle";
  let message = "";
  let destinationId = "";
  let disposed = false;

  const publish = (): void => {
    if (!disposed) dependencies.onState();
  };
  const resetResult = (): void => {
    status = "idle";
    message = "";
  };

  return {
    state: () => ({ mode, selectedIds, stagedTags, status, message, destinationId }),
    enter: () => {
      mode = true;
      resetResult();
      publish();
    },
    exit: () => {
      mode = false;
      selectedIds = [];
      stagedTags = [];
      destinationId = "";
      resetResult();
      publish();
    },
    toggle: (bookmarkId) => {
      selectedIds = selectedIds.includes(bookmarkId)
        ? selectedIds.filter((id) => id !== bookmarkId)
        : [...selectedIds, bookmarkId];
      resetResult();
      publish();
    },
    clear: () => {
      selectedIds = [];
      resetResult();
      publish();
    },
    retain: (bookmarkIds) => {
      const live = new Set(bookmarkIds);
      const retained = selectedIds.filter((id) => live.has(id));
      if (retained.length === selectedIds.length) return;
      selectedIds = retained;
      publish();
    },
    stage: (tag) => {
      if (stagedTags.some((candidate) => candidate.key === tag.key)) return;
      const existing = dependencies.rows().flatMap((row) => row.tags)
        .find((candidate) => candidate.key === tag.key);
      stagedTags = [...stagedTags, existing ?? tag];
      resetResult();
      publish();
    },
    unstage: (tagKey) => {
      stagedTags = stagedTags.filter((tag) => tag.key !== tagKey);
      resetResult();
      publish();
    },
    apply: async (operation) => {
      if (status === "saving" || selectedIds.length === 0 || stagedTags.length === 0) return;
      status = "saving";
      message = "";
      publish();
      const rows = new Map(dependencies.rows().map((row) => [row.id, row]));
      const updates: Record<string, readonly TagRecord[]> = {};
      const failed: string[] = [];
      for (const bookmarkId of selectedIds) {
        const row = rows.get(bookmarkId);
        if (row === undefined) continue;
        const nextTags = transformTags(row.tags, stagedTags, operation);
        if (tagsEqual(row.tags, nextTags)) continue;
        try {
          await dependencies.write(bookmarkId, nextTags);
          updates[bookmarkId] = nextTags;
        } catch (_error: unknown) {
          failed.push(bookmarkId);
        }
      }
      if (Object.keys(updates).length > 0) dependencies.commit(updates);
      selectedIds = failed;
      status = failed.length === 0 ? "success" : "error";
      message = failed.length === 0
        ? "Tags updated."
        : `${failed.length} bookmark${failed.length === 1 ? "" : "s"} could not be updated.`;
      if (failed.length === 0) stagedTags = [];
      publish();
    },
    moveDestinations: () => dependencies.moving?.destinations(dependencies.folders?.() ?? []) ?? [],
    setDestination: (nextDestinationId) => {
      if (status === "saving") return;
      destinationId = nextDestinationId;
      resetResult();
      publish();
    },
    move: async () => {
      const moving = dependencies.moving;
      if (moving === undefined || status === "saving" || selectedIds.length === 0 || destinationId.length === 0) return;
      status = "saving";
      message = "";
      publish();
      let result;
      try {
        result = await moving.moveMany(
          selectedIds,
          dependencies.rows(),
          destinationId,
          dependencies.folders?.() ?? [],
        );
      } catch (error: unknown) {
        status = "error";
        message = "Could not move bookmarks.";
        publish();
        throw error;
      }
      switch (result.kind) {
        case "invalid-destination":
          status = "error";
          message = "That folder is no longer available.";
          break;
        case "settled":
          selectedIds = result.failedIds;
          status = result.failedIds.length === 0 ? "success" : "error";
          message = result.failedIds.length > 0
            ? `${result.failedIds.length} bookmark${result.failedIds.length === 1 ? "" : "s"} could not be moved.`
            : result.movedIds.length === 0 ? "Bookmarks already in this folder." : "Bookmarks moved.";
          break;
        default: {
          const exhaustiveResult: never = result;
          return exhaustiveResult;
        }
      }
      publish();
    },
    dispose: () => {
      disposed = true;
      selectedIds = [];
      stagedTags = [];
      destinationId = "";
    },
  };
}
