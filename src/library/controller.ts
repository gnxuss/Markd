import type { BookmarkRow, LibraryState } from "../types.js";

type LibraryControllerDependencies = {
  readonly loadRows: () => Promise<readonly BookmarkRow[]>;
  readonly render: (state: LibraryState) => void;
};

export type LibraryController = {
  readonly bootstrap: () => Promise<void>;
};

export function createLibraryController(
  dependencies: LibraryControllerDependencies,
): LibraryController {
  return {
    bootstrap: async (): Promise<void> => {
      dependencies.render({ kind: "loading" });
      try {
        const rows = await dependencies.loadRows();
        dependencies.render(rows.length === 0 ? { kind: "empty" } : { kind: "ready", rows });
      } catch (error: unknown) {
        if (error instanceof Error) {
          dependencies.render({ kind: "error", message: "Bookmarks could not be loaded." });
          return;
        }
        throw error;
      }
    },
  };
}
