import { displayUrl } from "../bookmarks/display-url.js";
import type { BookmarkRow, LibraryState } from "../types.js";

export interface RenderElement {
  className: string;
  hidden: string | boolean;
  textContent: string | null;
}

export interface RenderDocument {
  createElement(tagName: string): RenderElement;
  addEventListener(element: RenderElement, type: string, listener: (event: Event) => void): void;
  append(element: RenderElement, nodes: readonly RenderElement[]): void;
  replaceChildren(element: RenderElement, nodes: readonly RenderElement[]): void;
  setAttribute(element: RenderElement, name: string, value: string): void;
}

export type LibraryElements = {
  readonly document: RenderDocument;
  readonly status: RenderElement;
  readonly bookmarks: RenderElement;
};

export type ActivateBookmark = (event: Event, row: BookmarkRow) => void;

function createBookmarkRow(
  row: BookmarkRow,
  elements: LibraryElements,
  activate: ActivateBookmark,
): RenderElement {
  const item = elements.document.createElement("li");
  item.className = "bookmark-row";
  elements.document.setAttribute(item, "data-bookmark-id", row.id);
  const link = elements.document.createElement("a");
  link.className = "bookmark-link";
  elements.document.setAttribute(link, "href", row.url);
  elements.document.addEventListener(link, "click", (event) => activate(event, row));
  const title = elements.document.createElement("span");
  title.className = "bookmark-title";
  title.textContent = row.title.length > 0 ? row.title : "Untitled bookmark";
  const url = elements.document.createElement("span");
  url.className = "bookmark-url";
  url.textContent = displayUrl(row.url);
  const tags = elements.document.createElement("span");
  tags.className = "bookmark-tags";
  elements.document.setAttribute(tags, "aria-label", "Tags");
  elements.document.append(link, [title, url, tags]);
  elements.document.append(item, [link]);
  return item;
}

export function renderLibrary(
  state: LibraryState,
  elements: LibraryElements,
  activate: ActivateBookmark,
): void {
  elements.document.replaceChildren(elements.bookmarks, []);
  elements.status.hidden = false;
  switch (state.kind) {
    case "loading":
      elements.status.textContent = "Loading bookmarks…";
      return;
    case "empty":
      elements.status.textContent = "No bookmarks found.";
      return;
    case "error":
      elements.status.textContent = state.message;
      return;
    case "ready": {
      elements.status.textContent = "";
      elements.status.hidden = true;
      const list = elements.document.createElement("ul");
      list.className = "bookmark-list";
      for (const row of state.rows) {
        elements.document.append(list, [createBookmarkRow(row, elements, activate)]);
      }
      elements.document.append(elements.bookmarks, [list]);
      return;
    }
    default: {
      const exhaustiveState: never = state;
      return exhaustiveState;
    }
  }
}
