import { loadTagAssignments, writeBookmarkTags } from "../tags/chrome-tag-storage.js";
import type { TagRecord } from "../types.js";
import { deriveQuickSaveContext, parseActivePage } from "./context.js";
import { createQuickSaveController, type QuickSaveState } from "./controller.js";
import { loadBookmarkNote, loadRecentTags, updateRecentTags, writeBookmarkNote } from "./metadata-storage.js";

function requiredElement<T extends HTMLElement>(id: string, constructor: { new(): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) throw new TypeError(`Missing required element: ${id}`);
  return element;
}

const content = requiredElement("content", HTMLElement);
const title = requiredElement("page-title", HTMLElement);
const url = requiredElement("page-url", HTMLElement);
const bookmarkState = requiredElement("bookmark-state", HTMLElement);
const form = requiredElement("save-form", HTMLFormElement);
const folder = requiredElement("folder", HTMLSelectElement);
const tagInput = requiredElement("tag-input", HTMLInputElement);
const addTag = requiredElement("add-tag", HTMLButtonElement);
const selectedTags = requiredElement("selected-tags", HTMLElement);
const suggestionList = requiredElement("tag-suggestions", HTMLElement);
const recentList = requiredElement("recent-tags", HTMLElement);
const note = requiredElement("note", HTMLTextAreaElement);
const save = requiredElement("save", HTMLButtonElement);
const status = requiredElement("status", HTMLElement);

let controller: ReturnType<typeof createQuickSaveController> | undefined;
let recentTags: readonly TagRecord[] = [];

function render(state: QuickSaveState): void {
  title.textContent = state.page.title;
  url.textContent = `${state.page.domain} · ${state.page.url}`;
  const target = state.matches[0];
  bookmarkState.hidden = target === undefined;
  bookmarkState.textContent = target === undefined ? "" : `Already bookmarked in ${target.folderLabel}.${
    state.matches.length > 1 ? ` Editing the first of ${state.matches.length} matches.` : ""
  }`;
  selectedTags.replaceChildren(...state.selectedTags.map((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.textContent = tag.label;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${tag.label}`);
    remove.addEventListener("click", () => controller?.removeTag(tag.key));
    chip.append(remove);
    return chip;
  }));
  suggestionList.replaceChildren(...state.suggestions.map((suggestion, index) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "tag-suggestion";
    option.id = `tag-suggestion-${index}`;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(index === state.activeSuggestionIndex));
    option.textContent = suggestion.kind === "create" ? `Create “${suggestion.tag.label}”` : suggestion.tag.label;
    option.addEventListener("click", () => {
      controller?.addTag(suggestion.tag.label);
      tagInput.focus();
    });
    return option;
  }));
  tagInput.setAttribute("aria-expanded", String(state.suggestions.length > 0));
  const activeSuggestion = state.activeSuggestionIndex < 0 ? undefined : `tag-suggestion-${state.activeSuggestionIndex}`;
  if (activeSuggestion === undefined) tagInput.removeAttribute("aria-activedescendant");
  else tagInput.setAttribute("aria-activedescendant", activeSuggestion);
  recentList.replaceChildren(...recentTags.filter((tag) => !state.selectedTags.some((selected) => selected.key === tag.key)).map((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = tag.label;
    button.addEventListener("click", () => controller?.addTag(tag.label));
    return button;
  }));
  if (note.value !== state.note) note.value = state.note;
  const pending = state.status === "saving";
  content.setAttribute("aria-busy", String(pending));
  save.disabled = pending;
  folder.disabled = pending || state.targetId !== undefined;
  save.textContent = state.targetId === undefined ? "Save" : "Update";
  status.textContent = state.message;
  status.classList.toggle("error", state.status === "error");
}

function commitTag(): void {
  controller?.commitSuggestion();
  tagInput.value = "";
  tagInput.focus();
}

addTag.addEventListener("click", commitTag);
tagInput.addEventListener("input", () => controller?.setTagInput(tagInput.value));
tagInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    controller?.moveSuggestion(event.key === "ArrowDown" ? 1 : -1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    commitTag();
  } else if (event.key === "Escape") {
    controller?.closeSuggestions();
  }
});
note.addEventListener("input", () => controller?.setNote(note.value));
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (tagInput.value.trim().length > 0) commitTag();
  if (controller !== undefined) void controller.submit(folder.value);
});

async function bootstrap(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activePage = parseActivePage(tabs[0]);
    if (activePage.kind === "error") {
      content.hidden = true;
      status.textContent = activePage.message;
      status.className = "error";
      return;
    }
    const context = deriveQuickSaveContext(activePage.page, await chrome.bookmarks.getTree());
    folder.replaceChildren(...context.folders.map((choice) => {
      const option = document.createElement("option");
      option.value = choice.id;
      option.textContent = choice.label;
      return option;
    }));
    const target = context.matches[0];
    const [assignments, targetNote, loadedRecent] = await Promise.all([
      loadTagAssignments(context.bookmarkIds),
      target === undefined ? Promise.resolve("") : loadBookmarkNote(target.id),
      loadRecentTags(),
    ]);
    recentTags = loadedRecent;
    const catalogTags = Object.values(assignments).flat();
    controller = createQuickSaveController({
      createBookmark: (details) => chrome.bookmarks.create(details),
      writeTags: writeBookmarkTags,
      writeNote: writeBookmarkNote,
      updateRecent: updateRecentTags,
      onState: render,
    }, context, { tags: target === undefined ? [] : assignments[target.id] ?? [], note: targetNote, recentTags, catalogTags });
    if (target !== undefined) folder.value = target.folderId;
    render(controller.state());
    queueMicrotask(() => tagInput.focus());
  } catch (error: unknown) {
    content.hidden = true;
    status.textContent = error instanceof Error ? `Could not load this page: ${error.message}` : "Could not load this page.";
    status.className = "error";
  }
}

void bootstrap();
