import { displayUrl } from "../bookmarks/display-url.js";
import type { BookmarkActivation } from "./controller.js";
import type { BookmarkRow, LibraryState, RowOpenState } from "../types.js";

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

export type ActivateBookmark = (event: BookmarkActivation, row: BookmarkRow) => void;

function activationFromEvent(event: Event): BookmarkActivation | undefined {
  if (!(event instanceof MouseEvent)) return undefined;
  const target = event.target;
  const currentTarget = event.currentTarget;
  const nestedInteractive =
    target instanceof Element &&
    target !== currentTarget &&
    target.closest("button,input,select,textarea,[role=button]") !== null;
  return {
    button: event.button,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    nestedInteractive,
    preventDefault: () => event.preventDefault(),
  };
}

function createBookmarkRow(
  row: BookmarkRow,
  openState: RowOpenState,
  elements: LibraryElements,
  activate: ActivateBookmark,
): RenderElement {
  const item = elements.document.createElement("li");
  item.className = "bookmark-row";
  elements.document.setAttribute(item, "data-bookmark-id", row.id);
  elements.document.setAttribute(item, "aria-busy", String(openState.kind === "opening"));
  const link = elements.document.createElement("a");
  link.className = "bookmark-link";
  elements.document.setAttribute(link, "href", row.url);
  const handleActivation = (event: Event): void => {
    const activation = activationFromEvent(event);
    if (activation !== undefined) activate(activation, row);
  };
  elements.document.addEventListener(link, "click", handleActivation);
  elements.document.addEventListener(link, "auxclick", handleActivation);
  const title = elements.document.createElement("span");
  title.className = "bookmark-title";
  title.textContent = row.title.length > 0 ? row.title : "Untitled bookmark";
  const url = elements.document.createElement("span");
  url.className = "bookmark-url";
  url.textContent = displayUrl(row.url);
  const tags = elements.document.createElement("span");
  tags.className = "bookmark-tags";
  elements.document.setAttribute(tags, "aria-label", "Tags");
  elements.document.append(link, [title]);
  elements.document.append(item, [link, url, tags]);
  if (openState.kind === "error") {
    const error = elements.document.createElement("span");
    error.className = "bookmark-error";
    error.textContent = openState.message;
    elements.document.setAttribute(error, "role", "status");
    elements.document.append(item, [error]);
  }
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
        const openState = state.rowStates[row.id] ?? { kind: "idle" };
        elements.document.append(list, [createBookmarkRow(row, openState, elements, activate)]);
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
