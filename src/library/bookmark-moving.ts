import type { BookmarkRow, NativeFolderNode } from "../types.js";

export type FolderDestination = {
  readonly id: string;
  readonly label: string;
};

export type MoveBookmarkRequest = {
  readonly bookmarkId: string;
  readonly currentParentId?: string;
  readonly destinationId: string;
  readonly folders: readonly NativeFolderNode[];
};

export type MoveBookmarkResult =
  | { readonly kind: "moved"; readonly bookmarkId: string }
  | { readonly kind: "unchanged"; readonly bookmarkId: string }
  | { readonly kind: "failed"; readonly bookmarkId: string; readonly message: string }
  | { readonly kind: "invalid-destination"; readonly destinationId: string };

export type MoveBookmarksResult = {
  readonly movedIds: readonly string[];
  readonly unchangedIds: readonly string[];
  readonly failedIds: readonly string[];
};

export type BookmarkMoving = {
  readonly destinations: (folders: readonly NativeFolderNode[]) => readonly FolderDestination[];
  readonly moveOne: (request: MoveBookmarkRequest) => Promise<MoveBookmarkResult>;
  readonly moveMany: (
    bookmarkIds: readonly string[],
    rows: readonly BookmarkRow[],
    destinationId: string,
    folders: readonly NativeFolderNode[],
  ) => Promise<MoveBookmarksResult>;
};

export type NativeBookmarkMover = (bookmarkId: string, destinationId: string) => Promise<void>;

function displayTitle(folder: NativeFolderNode): string {
  return folder.title.trim().length === 0 ? "Untitled folder" : folder.title;
}

export function folderDestinations(
  folders: readonly NativeFolderNode[],
): readonly FolderDestination[] {
  const destinations: FolderDestination[] = [];
  const visit = (nodes: readonly NativeFolderNode[], ancestors: readonly string[]): void => {
    for (const folder of nodes) {
      const path = [...ancestors, displayTitle(folder)];
      destinations.push({ id: folder.id, label: path.join(" / ") });
      visit(folder.children, path);
    }
  };
  visit(folders, []);
  return destinations;
}

export function createBookmarkMoving(
  nativeMove: NativeBookmarkMover,
  concurrency = 4,
): BookmarkMoving {
  const moveOne = async (request: MoveBookmarkRequest): Promise<MoveBookmarkResult> => {
    if (!folderDestinations(request.folders).some(({ id }) => id === request.destinationId)) {
      return { kind: "invalid-destination", destinationId: request.destinationId };
    }
    if (request.currentParentId === request.destinationId) {
      return { kind: "unchanged", bookmarkId: request.bookmarkId };
    }
    try {
      await nativeMove(request.bookmarkId, request.destinationId);
      return { kind: "moved", bookmarkId: request.bookmarkId };
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error;
      return { kind: "failed", bookmarkId: request.bookmarkId, message: error.message };
    }
  };

  return {
    destinations: folderDestinations,
    moveOne,
    moveMany: async (bookmarkIds, rows, destinationId, folders) => {
      const rowById = new Map(rows.map((row) => [row.id, row]));
      const requests = bookmarkIds.flatMap((bookmarkId) => {
        const row = rowById.get(bookmarkId);
        return row === undefined ? [] : [{
          bookmarkId,
          ...(row.folderId === undefined ? {} : { currentParentId: row.folderId }),
          destinationId,
          folders,
        }];
      });
      const results: MoveBookmarkResult[] = [];
      let nextIndex = 0;
      const worker = async (): Promise<void> => {
        while (nextIndex < requests.length) {
          const index = nextIndex;
          nextIndex += 1;
          const request = requests[index];
          if (request !== undefined) results[index] = await moveOne(request);
        }
      };
      const workerCount = Math.min(Math.max(1, concurrency), requests.length);
      await Promise.all(Array.from({ length: workerCount }, worker));
      return {
        movedIds: results.flatMap((result) => result.kind === "moved" ? [result.bookmarkId] : []),
        unchangedIds: results.flatMap((result) => result.kind === "unchanged" ? [result.bookmarkId] : []),
        failedIds: results.flatMap((result) => result.kind === "failed" ? [result.bookmarkId] : []),
      };
    },
  };
}
