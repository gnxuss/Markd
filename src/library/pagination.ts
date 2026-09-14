import type { LibraryElements, RenderElement } from "./render.js";

export const PAGE_SIZE = 100;

export type PageBounds = {
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly last: number;
};

export function pageBounds(total: number, requestedIndex: number): PageBounds {
  const last = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const index = Math.max(0, Math.min(requestedIndex, last));
  const start = index * PAGE_SIZE;
  return { index, start, end: Math.min(start + PAGE_SIZE, total), last };
}

export function createPagination(
  elements: LibraryElements,
  bounds: PageBounds,
  total: number,
  navigate: (index: number) => void,
): RenderElement {
  const navigation = elements.document.createElement("nav");
  navigation.className = "bookmark-pagination";
  elements.document.setAttribute(navigation, "aria-label", "Bookmark result pages");
  const previous = elements.document.createElement("button");
  previous.className = "pagination-button";
  previous.textContent = "Previous";
  elements.document.setAttribute(previous, "type", "button");
  if (bounds.index === 0) elements.document.setAttribute(previous, "disabled", "");
  elements.document.addEventListener(previous, "click", () => navigate(bounds.index - 1));
  const range = elements.document.createElement("span");
  range.className = "bookmark-range";
  range.textContent = `Showing ${bounds.start + 1}–${bounds.end} of ${total}`;
  const next = elements.document.createElement("button");
  next.className = "pagination-button";
  next.textContent = "Next";
  elements.document.setAttribute(next, "type", "button");
  if (bounds.index === bounds.last) elements.document.setAttribute(next, "disabled", "");
  elements.document.addEventListener(next, "click", () => navigate(bounds.index + 1));
  elements.document.append(navigation, [previous, range, next]);
  return navigation;
}
