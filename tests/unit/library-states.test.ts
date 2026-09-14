import { describe, expect, it, vi } from "vitest";

import { createLibraryController } from "../../src/library/controller.js";
import { createLibraryRenderer, renderLibrary } from "../../src/library/render.js";
import type { BookmarkRow, LibraryState } from "../../src/types.js";

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, (event: Event) => void>();
  className = "";
  hidden = false;
  textContent: string | null = null;

  addEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.set(type, listener);
  }

  click(): void {
    this.listeners.get("click")?.(new Event("click"));
  }

  append(...nodes: readonly FakeElement[]): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: readonly FakeElement[]): void {
    this.children.splice(0, this.children.length, ...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class FakeDocument {
  createElement(): FakeElement {
    return new FakeElement();
  }

  addEventListener(element: FakeElement, type: string, listener: (event: Event) => void): void {
    element.addEventListener(type, listener);
  }

  append(element: FakeElement, nodes: readonly FakeElement[]): void {
    element.append(...nodes);
  }

  replaceChildren(element: FakeElement, nodes: readonly FakeElement[]): void {
    element.replaceChildren(...nodes);
  }

  setAttribute(element: FakeElement, name: string, value: string): void {
    element.setAttribute(name, value);
  }
}

const row: BookmarkRow = {
  id: "native-id",
  title: "<img src=x onerror=alert(1)>",
  url: "https://www.example.com/reference",
  tags: [],
};

describe("library state", () => {
  it("distinguishes loading, loaded-empty, ready, and load failure", async () => {
    const observedStates: LibraryState[] = [];
    const render = (state: LibraryState): void => {
      observedStates.push(state);
    };
    const emptyController = createLibraryController({ loadRows: async () => [], render });
    await emptyController.bootstrap();
    const readyController = createLibraryController({ loadRows: async () => [row], render });
    await readyController.bootstrap();
    const errorController = createLibraryController({
      loadRows: async () => Promise.reject(new TypeError("bookmarks unavailable")),
      render,
    });
    await errorController.bootstrap();
    expect(observedStates.map(({ kind }) => kind)).toEqual([
      "loading",
      "empty",
      "loading",
      "ready",
      "loading",
      "error",
    ]);
  });

  it("renders bookmark-controlled strings as text with native navigation intact", () => {
    const documentPort = new FakeDocument();
    const status = new FakeElement();
    const bookmarks = new FakeElement();
    renderLibrary(
      { kind: "ready", rows: [row], view: "all", query: "", selectedTagKeys: [], catalog: [], rowStates: {}, tagStates: {} },
      { document: documentPort, status, bookmarks },
      vi.fn(),
    );
    const link = bookmarks.children[0]?.children[0]?.children[0];
    expect(link?.attributes.get("href")).toBe(row.url);
    expect(link?.children[0]?.textContent).toBe(row.title);
    expect(bookmarks.children[0]?.children[0]?.children[1]?.textContent).toBe(
      "example.com/reference",
    );
    expect(bookmarks.children[0]?.children[0]?.children[2]?.children).toEqual([]);
  });

  it("uses an explicit fallback for a blank native title", () => {
    const documentPort = new FakeDocument();
    const bookmarks = new FakeElement();
    renderLibrary(
      { kind: "ready", rows: [{ ...row, title: "" }], view: "all", query: "", selectedTagKeys: [], catalog: [], rowStates: {}, tagStates: {} },
      { document: documentPort, status: new FakeElement(), bookmarks },
      vi.fn(),
    );
    expect(bookmarks.children[0]?.children[0]?.children[0]?.children[0]?.textContent).toBe(
      "Untitled bookmark",
    );
  });

  it.each([
    ["all", "missing", [], "No bookmarks match your search and filters."],
    ["all", "", ["design"], "No bookmarks match your search and filters."],
    ["untagged", "missing", [], "No bookmarks match your search and filters."],
    ["untagged", "", [], "All bookmarks are tagged."],
  ] as const)("renders the correct ready-state empty message for %s view", (view, query, selectedTagKeys, message) => {
    const status = new FakeElement();
    renderLibrary(
      { kind: "ready", rows: [], view, query, selectedTagKeys, catalog: [], rowStates: {}, tagStates: {} },
      { document: new FakeDocument(), status, bookmarks: new FakeElement() },
      vi.fn(),
    );
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe(message);
  });

  it("keeps source-empty and no-tags messages distinct from retrieval no-match", () => {
    const documentPort = new FakeDocument();
    const status = new FakeElement();
    const catalog = new FakeElement();
    renderLibrary(
      { kind: "empty" },
      { document: documentPort, status, bookmarks: new FakeElement(), tagCatalog: catalog },
      vi.fn(),
    );
    expect(status.textContent).toBe("No bookmarks found.");

    renderLibrary(
      { kind: "ready", rows: [row], view: "all", query: "", selectedTagKeys: [], catalog: [], rowStates: {}, tagStates: {} },
      { document: documentPort, status, bookmarks: new FakeElement(), tagCatalog: catalog },
      vi.fn(),
    );
    expect(catalog.children[0]?.textContent).toBe("No tags yet");
  });

  it("pages ready rows, retains a valid page, and clamps after source shrink", () => {
    // Given: a stateful renderer and 205 ordered native bookmark rows.
    const bookmarks = new FakeElement();
    const renderer = createLibraryRenderer(
      { document: new FakeDocument(), status: new FakeElement(), bookmarks },
      vi.fn(),
    );
    const rows = Array.from({ length: 205 }, (_, index) => ({
      ...row,
      id: `native-${index}`,
      title: `Bookmark ${index}`,
    }));
    const state: LibraryState = {
      kind: "ready",
      rows,
      view: "all",
      query: "",
      selectedTagKeys: [],
      catalog: [],
      rowStates: {},
      tagStates: {},
    };
    renderer.render(state);

    // When: the user advances a page and the same source later shrinks.
    bookmarks.children[1]?.children[2]?.click();
    const secondPageFirstId = bookmarks.children[0]?.children[0]?.attributes.get("data-bookmark-id");
    renderer.render({ ...state, rows: rows.slice(0, 50) });

    // Then: only one bounded page renders and the now-invalid page clamps to the first.
    expect(secondPageFirstId).toBe("native-100");
    expect(bookmarks.children[0]?.children).toHaveLength(50);
    expect(bookmarks.children[0]?.children[0]?.attributes.get("data-bookmark-id")).toBe("native-0");
    expect(bookmarks.children[1]?.children[1]?.textContent).toBe("Showing 1–50 of 50");
  });
});
