import { openBookmark } from "../browser/open-tab.js";
import type { BookmarkRow, LibraryState, RowOpenState } from "../types.js";

export type BookmarkActivation = {
  readonly button: number;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly nestedInteractive: boolean;
  readonly preventDefault: () => void;
};

type LibraryControllerDependencies = {
  readonly loadRows: () => Promise<readonly BookmarkRow[]>;
  readonly open?: (url: string, background: boolean) => Promise<void>;
  readonly render: (state: LibraryState) => void;
  readonly schedule?: (callback: () => void, duration: number) => void;
};

export type LibraryController = {
  readonly bootstrap: () => Promise<void>;
  readonly activate: (event: BookmarkActivation, row: BookmarkRow) => Promise<void>;
};

export function createLibraryController(
  dependencies: LibraryControllerDependencies,
): LibraryController {
  let rows: readonly BookmarkRow[] = [];
  let rowStates: Readonly<Record<string, RowOpenState>> = {};
  const open = dependencies.open ?? openBookmark;
  const schedule = dependencies.schedule ?? ((callback, duration) => window.setTimeout(callback, duration));

  function renderReady(): void {
    dependencies.render({ kind: "ready", rows, rowStates });
  }

  return {
    bootstrap: async (): Promise<void> => {
      dependencies.render({ kind: "loading" });
      try {
        rows = await dependencies.loadRows();
        dependencies.render(
          rows.length === 0 ? { kind: "empty" } : { kind: "ready", rows, rowStates },
        );
      } catch (error: unknown) {
        if (error instanceof Error) {
          dependencies.render({ kind: "error", message: "Bookmarks could not be loaded." });
          return;
        }
        throw error;
      }
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
