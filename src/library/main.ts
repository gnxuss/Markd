import { loadBookmarkLibrary } from "../bookmarks/chrome-bookmarks.js";
import { loadTagAssignments, writeBookmarkTags } from "../tags/chrome-tag-storage.js";
import { loadBookmarkNote, loadBookmarkNotes, writeBookmarkNote } from "../quick-save/metadata-storage.js";
import { subscribeBookmarkLifecycle } from "./bookmark-lifecycle.js";
import { createBookmarkDetails } from "./bookmark-details.js";
import { createLibraryController } from "./controller.js";
import { createLibraryRenderer } from "./render.js";
import { createBulkOrganization } from "./bulk-organization.js";
import { createFolderNavigation } from "./folder-navigation.js";
import { createBookmarkMoving } from "./bookmark-moving.js";
import type { RenderElement } from "./render.js";
import type { LibraryState } from "../types.js";
import { nextTheme, persistTheme, readTheme, type Theme } from "../theme-preference.js";

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
    value: (element: RenderElement) => element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement ? element.value : "",
    setValue: (element: RenderElement, value: string) => {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) element.value = value;
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
const themeToggle = requiredElement("theme-toggle");
let theme: Theme = readTheme(localStorage);
const renderThemeToggle = (): void => {
  const dark = theme === "dark";
  themeToggle.textContent = dark ? "Light mode" : "Dark mode";
  themeToggle.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  themeToggle.setAttribute("aria-pressed", String(dark));
};
themeToggle.addEventListener("click", () => {
  theme = nextTheme(theme);
  persistTheme(theme);
  renderThemeToggle();
});
renderThemeToggle();
let renderer: ReturnType<typeof createLibraryRenderer>;
let folderNavigation: ReturnType<typeof createFolderNavigation>;
let latestState: LibraryState = { kind: "loading" };
const moving = createBookmarkMoving(async (bookmarkId, destinationId) => {
  await chrome.bookmarks.move(bookmarkId, { parentId: destinationId });
});
const controller = createLibraryController({
  loadLibrary: loadBookmarkLibrary,
  loadTags: loadTagAssignments,
  loadNotes: loadBookmarkNotes,
  writeTags: writeBookmarkTags,
  render: (state) => {
    latestState = state;
    if (state.kind === "ready") bulk.retain(controller.getRows().map((row) => row.id));
    renderer.render(state);
    folderNavigation.render(state);
  },
});
const details = createBookmarkDetails({
  load: loadBookmarkNote,
  write: writeBookmarkNote,
  onState: () => renderer.render(latestState),
  onSaved: controller.updateNote,
  folders: () => latestState.kind === "ready" || latestState.kind === "empty"
    ? latestState.folders ?? []
    : [],
  moving,
});
const bulk = createBulkOrganization({
  rows: controller.getRows,
  write: writeBookmarkTags,
  commit: controller.commitTags,
  onState: () => renderer.render(latestState),
  folders: () => latestState.kind === "ready" || latestState.kind === "empty"
    ? latestState.folders ?? []
    : [],
  moving,
});
folderNavigation = createFolderNavigation({
  root: requiredElement("folder-navigation"),
  selectFolder: controller.selectFolder,
  clearFolder: controller.clearFolder,
});
renderer = createLibraryRenderer(
  elements,
  (event, row) => { void controller.activate(event, row); },
  (bookmarkId, input) => { void controller.addTag(bookmarkId, input); },
  (bookmarkId, tagKey) => { void controller.removeTag(bookmarkId, tagKey); },
  (tagKey) => controller.toggleTagFilter(tagKey),
  details,
  bulk,
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
  bulk.dispose();
  folderNavigation.dispose();
  renderer.dispose();
}, { once: true });
