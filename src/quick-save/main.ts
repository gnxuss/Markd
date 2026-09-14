import { loadTagAssignments, writeBookmarkTags } from "../tags/chrome-tag-storage.js";
import { deriveQuickSaveContext, parseActivePage } from "./context.js";
import { createQuickSaveController, type QuickSaveState } from "./controller.js";

function requiredElement<T extends HTMLElement>(id: string, constructor: { new(): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) throw new TypeError(`Missing required element: ${id}`);
  return element;
}

const content = requiredElement("content", HTMLElement);
const title = requiredElement("page-title", HTMLElement);
const url = requiredElement("page-url", HTMLElement);
const form = requiredElement("save-form", HTMLFormElement);
const folder = requiredElement("folder", HTMLSelectElement);
const tagInput = requiredElement("tag-input", HTMLInputElement);
const addTag = requiredElement("add-tag", HTMLButtonElement);
const selectedTags = requiredElement("selected-tags", HTMLElement);
const save = requiredElement("save", HTMLButtonElement);
const status = requiredElement("status", HTMLElement);

let controller: ReturnType<typeof createQuickSaveController> | undefined;

function render(state: QuickSaveState): void {
  title.textContent = state.page.title;
  url.textContent = `${state.page.domain} · ${state.page.url}`;
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
  const pending = state.status === "saving";
  content.setAttribute("aria-busy", String(pending));
  save.disabled = pending;
  folder.disabled = pending || state.targetId !== undefined;
  save.textContent = state.targetId === undefined ? "Save" : "Update";
  status.textContent = state.message;
  status.classList.toggle("error", state.status === "error");
}

function commitTag(): void {
  controller?.addTag(tagInput.value);
  tagInput.value = "";
  tagInput.focus();
}

addTag.addEventListener("click", commitTag);
tagInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  commitTag();
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
    const tree = await chrome.bookmarks.getTree();
    const context = deriveQuickSaveContext(activePage.page, tree);
    folder.replaceChildren(...context.folders.map((choice) => {
      const option = document.createElement("option");
      option.value = choice.id;
      option.textContent = choice.label;
      return option;
    }));
    controller = createQuickSaveController({
      createBookmark: (details) => chrome.bookmarks.create(details),
      writeTags: writeBookmarkTags,
      onState: render,
    }, context);
    const target = context.matches[0];
    if (target !== undefined) {
      const assignments = await loadTagAssignments([target.id]);
      for (const tag of assignments[target.id] ?? []) controller.addTag(tag.label);
      folder.value = target.folderId;
    }
    render(controller.state());
    queueMicrotask(() => tagInput.focus());
  } catch (error: unknown) {
    content.hidden = true;
    status.textContent = error instanceof Error ? `Could not load this page: ${error.message}` : "Could not load this page.";
    status.className = "error";
  }
}

void bootstrap();
