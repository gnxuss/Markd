import { displayUrl } from "../bookmarks/display-url.js";
import type { BookmarkActivation } from "./controller.js";
import type { BookmarkRow, LibraryState, RowOpenState, RowTagState, TagRecord } from "../types.js";
import { createPagination, pageBounds } from "./pagination.js";
import { createTagEditor } from "./tag-editor.js";

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
  value?(element: RenderElement): string;
  focus?(element: RenderElement): void;
}

export type LibraryElements = {
  readonly document: RenderDocument;
  readonly status: RenderElement;
  readonly bookmarks: RenderElement;
  readonly allView?: RenderElement;
  readonly untaggedView?: RenderElement;
  readonly tagCatalog?: RenderElement;
};

export type ActivateBookmark = (event: BookmarkActivation, row: BookmarkRow) => void;
export type AddTag = (bookmarkId: string, input: string) => void;
export type RemoveTag = (bookmarkId: string, tagKey: string) => void;
export type ToggleTagFilter = (tagKey: string) => void;

export type LibraryRenderer = {
  readonly render: (state: LibraryState) => void;
  readonly dispose: () => void;
};

type PageRender = {
  readonly index: number;
  readonly navigate: (index: number) => void;
};

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
  tagState: RowTagState,
  elements: LibraryElements,
  activate: ActivateBookmark,
  addTag: AddTag,
  removeTag: RemoveTag,
  catalog: readonly TagRecord[],
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
  const editor = createTagEditor(
    row,
    tagState,
    catalog,
    elements,
    { add: addTag, remove: removeTag },
  );
  elements.document.append(link, [title]);
  elements.document.append(item, [link, url, editor.tags, editor.form]);
  if (openState.kind === "error") {
    const error = elements.document.createElement("span");
    error.className = "bookmark-error";
    error.textContent = openState.message;
    elements.document.setAttribute(error, "role", "status");
    elements.document.append(item, [error]);
  }
  if (editor.error !== undefined) elements.document.append(item, [editor.error]);
  return item;
}

function renderLibraryPage(
  state: LibraryState,
  elements: LibraryElements,
  activate: ActivateBookmark,
  addTag: AddTag = () => undefined,
  removeTag: RemoveTag = () => undefined,
  toggleTagFilter: ToggleTagFilter = () => undefined,
  page: PageRender = { index: 0, navigate: () => undefined },
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
      if (elements.allView !== undefined) {
        elements.allView.className = state.view === "all" ? "view-control active" : "view-control";
        elements.document.setAttribute(elements.allView, "aria-current", state.view === "all" ? "page" : "false");
      }
      if (elements.untaggedView !== undefined) {
        elements.untaggedView.className = state.view === "untagged" ? "view-control active" : "view-control";
        elements.document.setAttribute(elements.untaggedView, "aria-current", state.view === "untagged" ? "page" : "false");
      }
      if (elements.tagCatalog !== undefined) {
        const catalogNodes = state.catalog.length === 0
          ? (() => {
              const empty = elements.document.createElement("p");
              empty.className = "tag-catalog-empty";
              empty.textContent = "No tags yet";
              return [empty];
            })()
          : state.catalog.map((tag) => {
              const item = elements.document.createElement("button");
              item.className = "catalog-tag";
              item.textContent = `#${tag.label}`;
              elements.document.setAttribute(item, "type", "button");
              elements.document.setAttribute(item, "data-tag-key", tag.key);
              elements.document.setAttribute(
                item,
                "aria-pressed",
                String(state.selectedTagKeys.includes(tag.key)),
              );
              elements.document.addEventListener(item, "click", () => toggleTagFilter(tag.key));
              return item;
            });
        elements.document.replaceChildren(elements.tagCatalog, catalogNodes);
      }
      const hasActiveCriteria = state.query.trim().length > 0 || state.selectedTagKeys.length > 0;
      const noMatches = hasActiveCriteria && state.rows.length === 0;
      const emptyUntagged = !hasActiveCriteria && state.view === "untagged" && state.rows.length === 0;
      elements.status.textContent = noMatches
        ? "No bookmarks match your search and filters."
        : emptyUntagged ? "All bookmarks are tagged." : "";
      elements.status.hidden = !noMatches && !emptyUntagged;
      if (noMatches || emptyUntagged) return;
      const bounds = pageBounds(state.rows.length, page.index);
      const visibleRows = state.rows.slice(bounds.start, bounds.end);
      const list = elements.document.createElement("ul");
      list.className = "bookmark-list";
      for (const row of visibleRows) {
        const openState = state.rowStates[row.id] ?? { kind: "idle" };
        const tagState = state.tagStates[row.id] ?? { kind: "idle", input: "", focus: false };
        elements.document.append(list, [
          createBookmarkRow(row, openState, tagState, elements, activate, addTag, removeTag, state.catalog),
        ]);
      }
      elements.document.append(elements.bookmarks, [list]);
      const navigation = createPagination(elements, bounds, state.rows.length, page.navigate);
      elements.document.append(elements.bookmarks, [navigation]);
      return;
    }
    default: {
      const exhaustiveState: never = state;
      return exhaustiveState;
    }
  }
}

export function renderLibrary(
  state: LibraryState,
  elements: LibraryElements,
  activate: ActivateBookmark,
  addTag: AddTag = () => undefined,
  removeTag: RemoveTag = () => undefined,
  toggleTagFilter: ToggleTagFilter = () => undefined,
): void {
  renderLibraryPage(state, elements, activate, addTag, removeTag, toggleTagFilter);
}

export function createLibraryRenderer(
  elements: LibraryElements,
  activate: ActivateBookmark,
  addTag: AddTag = () => undefined,
  removeTag: RemoveTag = () => undefined,
  toggleTagFilter: ToggleTagFilter = () => undefined,
): LibraryRenderer {
  let pageIndex = 0;
  let criteriaSignature = "";
  let disposed = false;

  const render = (state: LibraryState): void => {
    if (disposed) return;
    if (state.kind !== "ready") {
      pageIndex = 0;
      criteriaSignature = "";
      renderLibraryPage(state, elements, activate, addTag, removeTag, toggleTagFilter);
      return;
    }
    const nextSignature = `${state.view}\n${state.query}\n${state.selectedTagKeys.join("\n")}`;
    if (nextSignature !== criteriaSignature) pageIndex = 0;
    criteriaSignature = nextSignature;
    const bounds = pageBounds(state.rows.length, pageIndex);
    pageIndex = bounds.index;
    renderLibraryPage(state, elements, activate, addTag, removeTag, toggleTagFilter, {
      index: pageIndex,
      navigate: (nextPage) => {
        pageIndex = pageBounds(state.rows.length, nextPage).index;
        render(state);
      },
    });
  };

  return {
    render,
    dispose: () => { disposed = true; },
  };
}
