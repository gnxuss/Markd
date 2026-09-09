import { describe, expect, it } from "vitest";

import { confirmedTagCatalog, selectRows } from "../../src/library/selectors.js";
import { createLibraryController } from "../../src/library/controller.js";
import type { BookmarkRow, LibraryState } from "../../src/types.js";

const rows = [
  { id: "one", title: "One", url: "https://one.example", tags: [] },
  {
    id: "two",
    title: "Two",
    url: "https://two.example",
    tags: [{ key: "design", label: "Design" }],
  },
  { id: "three", title: "Three", url: "https://three.example", tags: [] },
] as const satisfies readonly BookmarkRow[];

describe("confirmed library selectors", () => {
  it("preserves native order in All and Untagged", () => {
    expect(selectRows(rows, "all").map((row) => row.id)).toEqual(["one", "two", "three"]);
    expect(selectRows(rows, "untagged").map((row) => row.id)).toEqual(["one", "three"]);
  });

  it("derives one stable reusable catalog from confirmed assignments", () => {
    expect(confirmedTagCatalog([
      ...rows,
      { ...rows[0], tags: [{ key: "design", label: "Design" }, { key: "research", label: "Research" }] },
    ])).toEqual([
      { key: "design", label: "Design" },
      { key: "research", label: "Research" },
    ]);
  });
});

describe("durable Untagged transitions", () => {
  it("keeps a row visible until its first tag write succeeds", async () => {
    let resolveWrite: (() => void) | undefined;
    const states: LibraryState[] = [];
    const controller = createLibraryController({
      loadRows: async () => [rows[0]],
      loadTags: async () => ({}),
      writeTags: () => new Promise<void>((resolve) => { resolveWrite = resolve; }),
      render: (state) => states.push(state),
    });
    await controller.bootstrap();
    controller.selectView("untagged");

    const addPromise = controller.addTag("one", "Design");
    expect(states.at(-1)).toMatchObject({ kind: "ready", view: "untagged", rows: [{ id: "one" }] });
    resolveWrite?.();
    await addPromise;
    expect(states.at(-1)).toMatchObject({ kind: "ready", view: "untagged", rows: [] });
  });

  it("keeps a tagged row out until its final removal write succeeds", async () => {
    let resolveWrite: (() => void) | undefined;
    const states: LibraryState[] = [];
    const controller = createLibraryController({
      loadRows: async () => [rows[1]],
      loadTags: async () => ({ two: rows[1].tags }),
      writeTags: () => new Promise<void>((resolve) => { resolveWrite = resolve; }),
      render: (state) => states.push(state),
    });
    await controller.bootstrap();
    controller.selectView("untagged");

    const removePromise = controller.removeTag("two", "design");
    expect(states.at(-1)).toMatchObject({ kind: "ready", view: "untagged", rows: [] });
    resolveWrite?.();
    await removePromise;
    expect(states.at(-1)).toMatchObject({ kind: "ready", view: "untagged", rows: [{ id: "two" }] });
  });

  it("does not change Untagged membership after a rejected write", async () => {
    const states: LibraryState[] = [];
    const controller = createLibraryController({
      loadRows: async () => [rows[0]],
      loadTags: async () => ({}),
      writeTags: async () => Promise.reject(new TypeError("storage unavailable")),
      render: (state) => states.push(state),
    });
    await controller.bootstrap();
    controller.selectView("untagged");

    await controller.addTag("one", "Design");

    expect(states.at(-1)).toMatchObject({ kind: "ready", view: "untagged", rows: [{ id: "one" }] });
  });
});
