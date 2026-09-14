import { loadBookmarkRows } from "../bookmarks/chrome-bookmarks.js";
import { loadTagAssignments, writeBookmarkTags } from "../tags/chrome-tag-storage.js";
import { loadBookmarkNote, writeBookmarkNote } from "../quick-save/metadata-storage.js";
import { subscribeBookmarkLifecycle } from "./bookmark-lifecycle.js";
import { createBookmarkDetails } from "./bookmark-details.js";
import { createLibraryController } from "./controller.js";
import { createLibraryRenderer } from "./render.js";
import type { RenderElement } from "./render.js";
import type { LibraryState } from "../types.js";

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new TypeError(`Missing required element: ${id}`);
  }
  return element;
}

const elements = {
  document: {
    createElement: (tagName: string) => document.createElement(tagName),
    addEventListener: (element: RenderElement, type: string, listener: (event: Event) => void) => {
      if (element instanceof HTMLElement) element.addEventListener(type, listener);
    },
    append: (element: RenderElement, nodes: readonly RenderElement[]) => {
      if (element instanceof HTMLElement && nodes.every((node) => node instanceof HTMLElement)) {
        element.append(...nodes);
      }
    },
    replaceChildren: (element: RenderElement, nodes: readonly RenderElement[]) => {
      if (element instanceof HTMLElement && nodes.every((node) => node instanceof HTMLElement)) {
        element.replaceChildren(...nodes);
      }
    },
    remove: (element: RenderElement) => {
      if (element instanceof HTMLElement) element.remove();
    },
    setAttribute: (element: RenderElement, name: string, value: string) => {
      if (element instanceof HTMLElement) element.setAttribute(name, value);
    },
    value: (element: RenderElement) => element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.value : "",
    setValue: (element: RenderElement, value: string) => {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) element.value = value;
    },
    focus: (element: RenderElement) => {
      if (element instanceof HTMLElement) queueMicrotask(() => element.focus());
    },
  },
  status: requiredElement("status"),
  bookmarks: requiredElement("bookmarks"),
  allView: requiredElement("all-view"),
  untaggedView: requiredElement("untagged-view"),
  tagCatalog: requiredElement("tag-catalog"),
  search: requiredElement("bookmark-search"),
};
let renderer: ReturnType<typeof createLibraryRenderer>;
let latestState: LibraryState = { kind: "loading" };
const details = createBookmarkDetails({
  load: loadBookmarkNote,
  write: writeBookmarkNote,
  onState: () => renderer.render(latestState),
});
const controller = createLibraryController({
  loadRows: loadBookmarkRows,
  loadTags: loadTagAssignments,
  writeTags: writeBookmarkTags,
  render: (state) => {
    latestState = state;
    renderer.render(state);
  },
});
renderer = createLibraryRenderer(
  elements,
  (event, row) => { void controller.activate(event, row); },
  (bookmarkId, input) => { void controller.addTag(bookmarkId, input); },
  (bookmarkId, tagKey) => { void controller.removeTag(bookmarkId, tagKey); },
  (tagKey) => controller.toggleTagFilter(tagKey),
  details,
);
elements.allView.addEventListener("click", () => controller.selectView("all"));
elements.untaggedView.addEventListener("click", () => controller.selectView("untagged"));
elements.search.addEventListener("input", (event) => {
  if (event.currentTarget instanceof HTMLInputElement) controller.setSearch(event.currentTarget.value);
});
const lifecycle = subscribeBookmarkLifecycle(chrome.bookmarks, controller.refresh);
void lifecycle.start();
if (new URLSearchParams(location.search).get("focus") === "search") {
  elements.search.focus();
}
let disposed = false;
window.addEventListener("pagehide", () => {
  if (disposed) return;
  disposed = true;
  lifecycle.dispose();
  details.dispose();
  renderer.dispose();
}, { once: true });
