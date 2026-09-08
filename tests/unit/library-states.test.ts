import { describe, expect, it, vi } from "vitest";

import { createLibraryController } from "../../src/library/controller.js";
import { renderLibrary } from "../../src/library/render.js";
import type { BookmarkRow, LibraryState } from "../../src/types.js";

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  className = "";
  hidden = false;
  textContent: string | null = null;

  addEventListener(_type: string, _listener: (event: Event) => void): void {}

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
      { kind: "ready", rows: [row] },
      { document: documentPort, status, bookmarks },
      vi.fn(),
    );
    const link = bookmarks.children[0]?.children[0]?.children[0];
    expect(link?.attributes.get("href")).toBe(row.url);
    expect(link?.children[0]?.textContent).toBe(row.title);
    expect(link?.children[1]?.textContent).toBe("example.com/reference");
    expect(link?.children[2]?.children).toEqual([]);
  });

  it("uses an explicit fallback for a blank native title", () => {
    const documentPort = new FakeDocument();
    const bookmarks = new FakeElement();
    renderLibrary(
      { kind: "ready", rows: [{ ...row, title: "" }] },
      { document: documentPort, status: new FakeElement(), bookmarks },
      vi.fn(),
    );
    expect(bookmarks.children[0]?.children[0]?.children[0]?.children[0]?.textContent).toBe(
      "Untitled bookmark",
    );
  });
});
