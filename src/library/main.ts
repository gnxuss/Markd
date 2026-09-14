import { loadBookmarkRows } from "../bookmarks/chrome-bookmarks.js";
import { loadTagAssignments, writeBookmarkTags } from "../tags/chrome-tag-storage.js";
import { subscribeBookmarkLifecycle } from "./bookmark-lifecycle.js";
import { createLibraryController } from "./controller.js";
import { createLibraryRenderer } from "./render.js";
import type { RenderElement } from "./render.js";

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
    setAttribute: (element: RenderElement, name: string, value: string) => {
      if (element instanceof HTMLElement) element.setAttribute(name, value);
    },
    value: (element: RenderElement) => element instanceof HTMLInputElement ? element.value : "",
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
const controller = createLibraryController({
  loadRows: loadBookmarkRows,
  loadTags: loadTagAssignments,
  writeTags: writeBookmarkTags,
  render: (state) => renderer.render(state),
});
renderer = createLibraryRenderer(
  elements,
  (event, row) => { void controller.activate(event, row); },
  (bookmarkId, input) => { void controller.addTag(bookmarkId, input); },
  (bookmarkId, tagKey) => { void controller.removeTag(bookmarkId, tagKey); },
  (tagKey) => controller.toggleTagFilter(tagKey),
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
  renderer.dispose();
}, { once: true });
