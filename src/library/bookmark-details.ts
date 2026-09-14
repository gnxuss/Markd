export type BookmarkDetailsState =
  | { readonly kind: "closed" }
  | { readonly kind: "loading"; readonly bookmarkId: string }
  | {
      readonly kind: "ready";
      readonly bookmarkId: string;
      readonly note: string;
      readonly draft: string;
      readonly message: string;
    }
  | {
      readonly kind: "saving";
      readonly bookmarkId: string;
      readonly note: string;
      readonly draft: string;
    }
  | {
      readonly kind: "error";
      readonly bookmarkId: string;
      readonly note: string;
      readonly draft: string;
      readonly operation: "load" | "save";
      readonly message: string;
    };

export type BookmarkDetails = {
  readonly state: (bookmarkId: string) => BookmarkDetailsState;
  readonly areAllOpen: (bookmarkIds: readonly string[]) => boolean;
  readonly toggle: (bookmarkId: string) => Promise<void>;
  readonly openAll: (bookmarkIds: readonly string[]) => Promise<void>;
  readonly closeAll: (bookmarkIds: readonly string[]) => void;
  readonly retain: (bookmarkIds: readonly string[]) => void;
  readonly setDraft: (bookmarkId: string, draft: string) => void;
  readonly save: (bookmarkId: string) => Promise<void>;
  readonly retry: (bookmarkId: string) => Promise<void>;
  readonly dispose: () => void;
};

type BookmarkDetailsDependencies = {
  readonly load: (bookmarkId: string) => Promise<string>;
  readonly write: (bookmarkId: string, note: string) => Promise<void>;
  readonly onState: () => void;
};

function errorMessage(error: unknown, action: "load" | "save"): string {
  const detail = error instanceof Error ? ` ${error.message}` : "";
  return action === "load"
    ? `Could not load note.${detail}`
    : `Could not save note.${detail}`;
}

export function createBookmarkDetails(
  dependencies: BookmarkDetailsDependencies,
): BookmarkDetails {
  const states = new Map<string, BookmarkDetailsState>();
  const generations = new Map<string, number>();
  let disposed = false;

  const publish = (): void => {
    if (!disposed) dependencies.onState();
  };
  const nextGeneration = (bookmarkId: string): number => {
    const next = (generations.get(bookmarkId) ?? 0) + 1;
    generations.set(bookmarkId, next);
    return next;
  };
  const isCurrent = (bookmarkId: string, generation: number): boolean =>
    !disposed && generations.get(bookmarkId) === generation;
  const load = async (bookmarkId: string, notify: boolean): Promise<void> => {
    const generation = nextGeneration(bookmarkId);
    states.set(bookmarkId, { kind: "loading", bookmarkId });
    if (notify) publish();
    try {
      const note = await dependencies.load(bookmarkId);
      if (!isCurrent(bookmarkId, generation)) return;
      states.set(bookmarkId, { kind: "ready", bookmarkId, note, draft: note, message: "" });
    } catch (error: unknown) {
      if (!isCurrent(bookmarkId, generation)) return;
      states.set(bookmarkId, {
        kind: "error",
        bookmarkId,
        note: "",
        draft: "",
        operation: "load",
        message: errorMessage(error, "load"),
      });
    }
    if (notify) publish();
  };
  const close = (bookmarkId: string): void => {
    nextGeneration(bookmarkId);
    states.delete(bookmarkId);
  };
  const save = async (bookmarkId: string): Promise<void> => {
    const current = states.get(bookmarkId);
    if (current?.kind !== "ready" && !(current?.kind === "error" && current.operation === "save")) return;
    const { note, draft } = current;
    const generation = generations.get(bookmarkId) ?? 0;
    states.set(bookmarkId, { kind: "saving", bookmarkId, note, draft });
    publish();
    try {
      await dependencies.write(bookmarkId, draft);
      if (!isCurrent(bookmarkId, generation)) return;
      states.set(bookmarkId, { kind: "ready", bookmarkId, note: draft, draft, message: "Note saved." });
    } catch (error: unknown) {
      if (!isCurrent(bookmarkId, generation)) return;
      states.set(bookmarkId, {
        kind: "error",
        bookmarkId,
        note,
        draft,
        operation: "save",
        message: errorMessage(error, "save"),
      });
    }
    publish();
  };

  return {
    state: (bookmarkId) => states.get(bookmarkId) ?? { kind: "closed" },
    areAllOpen: (bookmarkIds) => bookmarkIds.length > 0
      && bookmarkIds.every((bookmarkId) => states.has(bookmarkId)),
    toggle: async (bookmarkId) => {
      if (states.has(bookmarkId)) {
        close(bookmarkId);
        publish();
      } else {
        await load(bookmarkId, true);
      }
    },
    openAll: async (bookmarkIds) => {
      const closedIds = bookmarkIds.filter((bookmarkId) => !states.has(bookmarkId));
      if (closedIds.length === 0) return;
      const pending = closedIds.map((bookmarkId) => load(bookmarkId, false));
      publish();
      await Promise.all(pending);
      publish();
    },
    closeAll: (bookmarkIds) => {
      for (const bookmarkId of bookmarkIds) close(bookmarkId);
      publish();
    },
    retain: (bookmarkIds) => {
      const retained = new Set(bookmarkIds);
      for (const bookmarkId of states.keys()) {
        if (!retained.has(bookmarkId)) close(bookmarkId);
      }
    },
    setDraft: (bookmarkId, draft) => {
      const current = states.get(bookmarkId);
      if (current?.kind === "ready" || current?.kind === "saving" || current?.kind === "error") {
        states.set(bookmarkId, { ...current, draft });
      }
    },
    save,
    retry: async (bookmarkId) => {
      const current = states.get(bookmarkId);
      if (current?.kind !== "error") return;
      if (current.operation === "load") await load(bookmarkId, true);
      else await save(bookmarkId);
    },
    dispose: () => {
      disposed = true;
      for (const bookmarkId of states.keys()) nextGeneration(bookmarkId);
      states.clear();
    },
  };
}
