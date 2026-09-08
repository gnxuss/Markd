import { loadBookmarkRows } from "../bookmarks/chrome-bookmarks.js";
import { createLibraryController } from "./controller.js";
import { renderLibrary } from "./render.js";
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
  },
  status: requiredElement("status"),
  bookmarks: requiredElement("bookmarks"),
};
const controller = createLibraryController({
  loadRows: loadBookmarkRows,
  render: (state) => renderLibrary(state, elements, (event, row) => {
    void controller.activate(event, row);
  }),
});
void controller.bootstrap();
