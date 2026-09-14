import type { TagRecord } from "../types.js";
import { resolveTagInput } from "../tags/canonicalize.js";
import type { QuickSaveContext } from "./context.js";

export type QuickSaveStatus = "ready" | "saving" | "success" | "error";
export type QuickSaveState = QuickSaveContext & {
  readonly status: QuickSaveStatus;
  readonly selectedTags: readonly TagRecord[];
  readonly message: string;
  readonly targetId?: string;
};

type CreatedBookmark = { readonly id: string };
export type QuickSaveDependencies = {
  readonly createBookmark: (details: {
    readonly parentId: string;
    readonly title: string;
    readonly url: string;
  }) => Promise<CreatedBookmark>;
  readonly writeTags: (bookmarkId: string, tags: readonly TagRecord[]) => Promise<void>;
  readonly onState: (state: QuickSaveState) => void;
};

export type QuickSaveController = {
  readonly state: () => QuickSaveState;
  readonly addTag: (input: string) => void;
  readonly removeTag: (key: string) => void;
  readonly submit: (folderId: string) => Promise<void>;
};

export function createQuickSaveController(
  dependencies: QuickSaveDependencies,
  context: QuickSaveContext,
): QuickSaveController {
  const initialTarget = context.matches[0];
  let state: QuickSaveState = {
    ...context,
    status: "ready",
    selectedTags: [],
    message: initialTarget === undefined ? "Ready to save." : "Already bookmarked.",
    ...(initialTarget === undefined ? {} : { targetId: initialTarget.id }),
  };
  const publish = (next: QuickSaveState): void => {
    state = next;
    dependencies.onState(state);
  };
  return {
    state: () => state,
    addTag: (input): void => {
      const resolved = resolveTagInput(input, state.selectedTags);
      if (resolved.kind === "invalid" || resolved.kind === "existing") return;
      publish({ ...state, selectedTags: [...state.selectedTags, resolved.tag] });
    },
    removeTag: (key): void => {
      publish({ ...state, selectedTags: state.selectedTags.filter((tag) => tag.key !== key) });
    },
    submit: async (folderId): Promise<void> => {
      if (state.status === "saving") return;
      publish({ ...state, status: "saving", message: "Saving…" });
      try {
        const targetId = state.targetId ?? (await dependencies.createBookmark({
          parentId: folderId,
          title: state.page.title,
          url: state.page.url,
        })).id;
        publish({ ...state, targetId });
        await dependencies.writeTags(targetId, state.selectedTags);
        publish({ ...state, status: "success", targetId, message: "Saved." });
      } catch (error: unknown) {
        const message = error instanceof Error ? `Could not save: ${error.message}` : "Could not save. Try again.";
        publish({ ...state, status: "error", message });
      }
    },
  };
}
