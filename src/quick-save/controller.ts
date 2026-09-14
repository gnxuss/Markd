import type { TagRecord } from "../types.js";
import { parseTagInput, resolveTagInput } from "../tags/canonicalize.js";
import type { QuickSaveContext } from "./context.js";

export type TagSuggestion = { readonly kind: "existing" | "create"; readonly tag: TagRecord };
export type QuickSaveStatus = "ready" | "saving" | "success" | "error";
export type QuickSaveState = QuickSaveContext & {
  readonly status: QuickSaveStatus;
  readonly selectedTags: readonly TagRecord[];
  readonly note: string;
  readonly tagInput: string;
  readonly suggestions: readonly TagSuggestion[];
  readonly activeSuggestionIndex: number;
  readonly message: string;
  readonly targetId?: string;
};
export type InitialMetadata = {
  readonly tags: readonly TagRecord[];
  readonly note: string;
  readonly recentTags: readonly TagRecord[];
  readonly catalogTags: readonly TagRecord[];
};
type CreatedBookmark = { readonly id: string };
export type QuickSaveDependencies = {
  readonly createBookmark: (details: { readonly parentId: string; readonly title: string; readonly url: string }) => Promise<CreatedBookmark>;
  readonly writeTags: (bookmarkId: string, tags: readonly TagRecord[]) => Promise<void>;
  readonly writeNote: (bookmarkId: string, note: string) => Promise<void>;
  readonly updateRecent: (tags: readonly TagRecord[]) => Promise<void>;
  readonly onState: (state: QuickSaveState) => void;
};
export type QuickSaveController = {
  readonly state: () => QuickSaveState;
  readonly addTag: (input: string) => void;
  readonly removeTag: (key: string) => void;
  readonly setNote: (note: string) => void;
  readonly setTagInput: (input: string) => void;
  readonly moveSuggestion: (delta: -1 | 1) => void;
  readonly closeSuggestions: () => void;
  readonly commitSuggestion: () => void;
  readonly submit: (folderId: string) => Promise<void>;
};

export function buildTagSuggestions(input: string, catalog: readonly TagRecord[], selected: readonly TagRecord[]): readonly TagSuggestion[] {
  const parsed = parseTagInput(input);
  if (parsed.kind === "invalid") return [];
  const selectedKeys = new Set(selected.map((tag) => tag.key));
  const matches = catalog.filter((tag) => !selectedKeys.has(tag.key) && (
    tag.label.toLowerCase().includes(parsed.tag.key) || tag.key.includes(parsed.tag.key)
  )).slice(0, 6).map((tag): TagSuggestion => ({ kind: "existing", tag }));
  return matches.some((suggestion) => suggestion.tag.key === parsed.tag.key)
    ? matches
    : [...matches, { kind: "create", tag: parsed.tag }];
}

export function createQuickSaveController(
  dependencies: QuickSaveDependencies,
  context: QuickSaveContext,
  metadata: InitialMetadata = { tags: [], note: "", recentTags: [], catalogTags: [] },
): QuickSaveController {
  const initialTarget = context.matches[0];
  const catalog = [...metadata.tags, ...metadata.recentTags, ...metadata.catalogTags].filter(
    (tag, index, tags) => tags.findIndex((candidate) => candidate.key === tag.key) === index,
  );
  let state: QuickSaveState = {
    ...context, status: "ready", selectedTags: metadata.tags, note: metadata.note,
    tagInput: "", suggestions: [], activeSuggestionIndex: -1,
    message: initialTarget === undefined ? "Ready to save." : "Already bookmarked.",
    ...(initialTarget === undefined ? {} : { targetId: initialTarget.id }),
  };
  const publish = (next: QuickSaveState): void => { state = next; dependencies.onState(state); };
  const addResolvedTag = (input: string): void => {
    const resolved = resolveTagInput(input, catalog);
    if (resolved.kind === "invalid" || state.selectedTags.some((tag) => tag.key === resolved.tag.key)) return;
    publish({ ...state, selectedTags: [...state.selectedTags, resolved.tag], tagInput: "", suggestions: [], activeSuggestionIndex: -1 });
  };
  return {
    state: () => state,
    addTag: addResolvedTag,
    removeTag: (key): void => publish({ ...state, selectedTags: state.selectedTags.filter((tag) => tag.key !== key) }),
    setNote: (note): void => publish({ ...state, note: note.slice(0, 280) }),
    setTagInput: (input): void => {
      const suggestions = buildTagSuggestions(input, catalog, state.selectedTags);
      publish({ ...state, tagInput: input, suggestions, activeSuggestionIndex: suggestions.length === 0 ? -1 : 0 });
    },
    moveSuggestion: (delta): void => {
      if (state.suggestions.length === 0) return;
      const next = (state.activeSuggestionIndex + delta + state.suggestions.length) % state.suggestions.length;
      publish({ ...state, activeSuggestionIndex: next });
    },
    closeSuggestions: (): void => publish({ ...state, suggestions: [], activeSuggestionIndex: -1 }),
    commitSuggestion: (): void => {
      const suggestion = state.suggestions[state.activeSuggestionIndex];
      addResolvedTag(suggestion?.tag.label ?? state.tagInput);
    },
    submit: async (folderId): Promise<void> => {
      if (state.status === "saving") return;
      const wasNew = state.targetId === undefined;
      publish({ ...state, status: "saving", message: wasNew ? "Saving…" : "Updating…" });
      try {
        const targetId = state.targetId ?? (await dependencies.createBookmark({ parentId: folderId, title: state.page.title, url: state.page.url })).id;
        publish({ ...state, targetId });
        await dependencies.writeTags(targetId, state.selectedTags);
        await dependencies.writeNote(targetId, state.note.trim());
        await dependencies.updateRecent(state.selectedTags);
        publish({ ...state, status: "success", targetId, message: wasNew ? "Saved." : "Updated." });
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : "Try again.";
        publish({ ...state, status: "error", message: `Could not save: ${detail}` });
      }
    },
  };
}
