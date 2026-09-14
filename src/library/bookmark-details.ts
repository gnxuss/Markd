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
  readonly state: () => BookmarkDetailsState;
  readonly open: (bookmarkId: string) => Promise<void>;
  readonly toggle: (bookmarkId: string) => Promise<void>;
  readonly close: () => void;
  readonly setDraft: (draft: string) => void;
  readonly save: () => Promise<void>;
  readonly retry: () => Promise<void>;
  readonly dispose: () => void;
};

type BookmarkDetailsDependencies = {
  readonly load: (bookmarkId: string) => Promise<string>;
  readonly write: (bookmarkId: string, note: string) => Promise<void>;
  readonly onState: (state: BookmarkDetailsState) => void;
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
  let current: BookmarkDetailsState = { kind: "closed" };
  let generation = 0;
  let disposed = false;

  const publish = (state: BookmarkDetailsState): void => {
    current = state;
    if (!disposed) dependencies.onState(state);
  };

  const open = async (bookmarkId: string): Promise<void> => {
    const request = ++generation;
    publish({ kind: "loading", bookmarkId });
    try {
      const note = await dependencies.load(bookmarkId);
      if (disposed || request !== generation) return;
      publish({ kind: "ready", bookmarkId, note, draft: note, message: "" });
    } catch (error: unknown) {
      if (disposed || request !== generation) return;
      publish({
        kind: "error",
        bookmarkId,
        note: "",
        draft: "",
        operation: "load",
        message: errorMessage(error, "load"),
      });
    }
  };

  const close = (): void => {
    generation += 1;
    publish({ kind: "closed" });
  };

  const save = async (): Promise<void> => {
    if (current.kind !== "ready" && !(current.kind === "error" && current.operation === "save")) return;
    const { bookmarkId, note, draft } = current;
    const request = generation;
    publish({ kind: "saving", bookmarkId, note, draft });
    try {
      await dependencies.write(bookmarkId, draft);
      if (disposed || request !== generation) return;
      publish({ kind: "ready", bookmarkId, note: draft, draft, message: "Note saved." });
    } catch (error: unknown) {
      if (disposed || request !== generation) return;
      publish({
        kind: "error",
        bookmarkId,
        note,
        draft,
        operation: "save",
        message: errorMessage(error, "save"),
      });
    }
  };

  return {
    state: () => current,
    open,
    toggle: async (bookmarkId) => {
      if (current.kind !== "closed" && current.bookmarkId === bookmarkId) close();
      else await open(bookmarkId);
    },
    close,
    setDraft: (draft) => {
      if (current.kind === "ready" || current.kind === "saving" || current.kind === "error") {
        current = { ...current, draft };
      }
    },
    save,
    retry: async () => {
      if (current.kind !== "error") return;
      if (current.operation === "load") await open(current.bookmarkId);
      else await save();
    },
    dispose: () => {
      disposed = true;
      generation += 1;
      current = { kind: "closed" };
    },
  };
}
