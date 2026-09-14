import { displayUrl } from "../bookmarks/display-url.js";
import type { BookmarkRow, RowOpenState, RowTagState, TagRecord } from "../types.js";
import type { BookmarkActivation } from "./controller.js";
import type { BookmarkDetails, BookmarkDetailsState } from "./bookmark-details.js";
import type { LibraryElements, RenderElement } from "./render.js";
import { createTagEditor } from "./tag-editor.js";

export type BookmarkRowActions = {
  readonly activate: (event: BookmarkActivation, row: BookmarkRow) => void;
  readonly addTag: (bookmarkId: string, input: string) => void;
  readonly removeTag: (bookmarkId: string, tagKey: string) => void;
};

function activationFromEvent(event: Event): BookmarkActivation | undefined {
  if (!(event instanceof MouseEvent)) return undefined;
  const target = event.target;
  const currentTarget = event.currentTarget;
  return {
    button: event.button,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    nestedInteractive: target instanceof Element && target !== currentTarget
      && target.closest("button,input,select,textarea,[role=button]") !== null,
    preventDefault: () => event.preventDefault(),
  };
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && target.closest("a,button,input,select,textarea,label,[role=button],.bookmark-details") !== null;
}

function appendNoteEditor(
  item: RenderElement,
  row: BookmarkRow,
  state: Exclude<BookmarkDetailsState, { readonly kind: "closed" }>,
  elements: LibraryElements,
  details: BookmarkDetails,
): void {
  const panel = elements.document.createElement("section");
  panel.className = "bookmark-details";
  elements.document.setAttribute(panel, "id", `bookmark-details-${row.id}`);
  elements.document.setAttribute(panel, "aria-label", `Note for ${row.title || "Untitled bookmark"}`);
  elements.document.setAttribute(panel, "aria-busy", String(state.kind === "loading" || state.kind === "saving"));
  if (state.kind === "loading") {
    panel.textContent = "Loading note…";
    elements.document.setAttribute(panel, "role", "status");
    elements.document.append(item, [panel]);
    return;
  }
  const status = elements.document.createElement("p");
  status.className = state.kind === "error" ? "note-status error" : "note-status";
  status.textContent = state.kind === "error"
    ? state.message
    : state.note.length === 0 ? "No note yet." : state.kind === "ready" ? state.message : "";
  elements.document.setAttribute(status, "role", "status");
  if (state.kind === "error" && state.operation === "load") {
    const retry = elements.document.createElement("button");
    retry.className = "note-retry";
    retry.textContent = "Retry";
    elements.document.setAttribute(retry, "type", "button");
    elements.document.addEventListener(retry, "click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void details.retry(row.id);
    });
    elements.document.append(panel, [status, retry]);
    elements.document.append(item, [panel]);
    return;
  }
  const label = elements.document.createElement("label");
  label.textContent = "Note";
  elements.document.setAttribute(label, "for", `bookmark-note-${row.id}`);
  const textarea = elements.document.createElement("textarea");
  textarea.className = "bookmark-note";
  elements.document.setAttribute(textarea, "id", `bookmark-note-${row.id}`);
  elements.document.setAttribute(textarea, "maxlength", "280");
  elements.document.setAttribute(textarea, "rows", "3");
  elements.document.setValue?.(textarea, state.draft);
  elements.document.addEventListener(textarea, "input", () => {
    details.setDraft(row.id, elements.document.value?.(textarea) ?? "");
  });
  const save = elements.document.createElement("button");
  save.className = "note-save";
  save.textContent = state.kind === "saving" ? "Saving…" : "Save note";
  elements.document.setAttribute(save, "type", "button");
  elements.document.setAttribute(save, "aria-disabled", String(state.kind === "saving"));
  if (state.kind === "saving") elements.document.setAttribute(save, "disabled", "");
  elements.document.addEventListener(save, "click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void details.save(row.id);
  });
  elements.document.append(panel, [status, label, textarea, save]);
  elements.document.append(item, [panel]);
}

export function createBookmarkRow(
  row: BookmarkRow,
  openState: RowOpenState,
  tagState: RowTagState,
  catalog: readonly TagRecord[],
  elements: LibraryElements,
  actions: BookmarkRowActions,
  details?: BookmarkDetails,
): RenderElement {
  const item = elements.document.createElement("li");
  item.className = "bookmark-row";
  elements.document.setAttribute(item, "data-bookmark-id", row.id);
  elements.document.setAttribute(item, "aria-busy", String(openState.kind === "opening"));
  const handleActivation = (event: Event): void => {
    const activation = activationFromEvent(event);
    if (activation !== undefined) actions.activate(activation, row);
  };
  const title = elements.document.createElement("a");
  title.className = "bookmark-link bookmark-title";
  title.textContent = row.title.length > 0 ? row.title : "Untitled bookmark";
  const url = elements.document.createElement("a");
  url.className = "bookmark-link bookmark-url";
  url.textContent = displayUrl(row.url);
  for (const link of [title, url]) {
    elements.document.setAttribute(link, "href", row.url);
    elements.document.addEventListener(link, "click", handleActivation);
    elements.document.addEventListener(link, "auxclick", handleActivation);
  }
  const editor = createTagEditor(row, tagState, catalog, elements, {
    add: actions.addTag,
    remove: actions.removeTag,
  });
  elements.document.append(item, [title, url, editor.tags, editor.form]);
  if (details !== undefined) {
    const detailState = details.state(row.id);
    const expanded = detailState.kind !== "closed";
    elements.document.addEventListener(item, "click", (event) => {
      if (event instanceof MouseEvent && event.button === 0 && !isInteractiveTarget(event.target)) {
        void details.toggle(row.id);
      }
    });
    const button = elements.document.createElement("button");
    button.className = "details-toggle";
    button.textContent = expanded ? "Hide details" : "Details";
    elements.document.setAttribute(button, "type", "button");
    elements.document.setAttribute(button, "aria-expanded", String(expanded));
    elements.document.setAttribute(button, "aria-controls", `bookmark-details-${row.id}`);
    elements.document.addEventListener(button, "click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void details.toggle(row.id);
    });
    elements.document.append(item, [button]);
    if (detailState.kind !== "closed") {
      appendNoteEditor(item, row, detailState, elements, details);
    }
  }
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
