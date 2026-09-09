import { describe, expect, it, vi } from "vitest";

import { parseTagInput, resolveTagInput } from "../../src/tags/canonicalize.js";
import { createLibraryController } from "../../src/library/controller.js";
import type { BookmarkRow, LibraryState, TagRecord } from "../../src/types.js";

const row: BookmarkRow = {
  id: "native-one",
  title: "Example",
  url: "https://example.com/reference",
  tags: [],
};

describe("tag canonicalization", () => {
  it("trims a valid label and derives a normalized case-insensitive key", () => {
    expect(parseTagInput("  Design  ")).toEqual({
      kind: "valid",
      tag: { key: "design", label: "Design" },
    });
  });

  it("rejects input that is empty after trimming", () => {
    expect(parseTagInput(" \n\t ")).toEqual({ kind: "invalid" });
  });

  it.each([
    ["design", "Design"],
    [" DESIGN ", "Design"],
    ["De\u0301cor", "Décor"],
  ])("reuses the first display spelling for %s", (input, expectedLabel) => {
    const catalog = [
      { key: "design", label: "Design" },
      { key: "décor", label: "Décor" },
    ] as const;
    expect(resolveTagInput(input, catalog)).toEqual({
      kind: "existing",
      tag: { key: expectedLabel.toLowerCase(), label: expectedLabel },
    });
  });

  it("returns an explicit accepted outcome for a new canonical tag", () => {
    expect(resolveTagInput("Research", [])).toEqual({
      kind: "accepted",
      tag: { key: "research", label: "Research" },
    });
  });
});

describe("confirmed durable tagging", () => {
  it("shows a new tag only after its storage write resolves", async () => {
    let resolveWrite: (() => void) | undefined;
    const writeTags = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveWrite = resolve;
      }),
    );
    const states: LibraryState[] = [];
    const controller = createLibraryController({
      loadRows: async () => [row],
      loadTags: async () => ({}),
      writeTags,
      render: (state) => states.push(state),
    });

    await controller.bootstrap();
    const addPromise = controller.addTag(row.id, "  Design  ");
    expect(states.at(-1)).toMatchObject({
      kind: "ready",
      rows: [{ tags: [] }],
      tagStates: { "native-one": { kind: "saving", input: "  Design  " } },
    });
    resolveWrite?.();
    await addPromise;

    const expectedTags: readonly TagRecord[] = [{ key: "design", label: "Design" }];
    expect(writeTags).toHaveBeenCalledWith(row.id, expectedTags);
    expect(states.at(-1)).toMatchObject({
      kind: "ready",
      rows: [{ tags: expectedTags }],
      tagStates: { "native-one": { kind: "idle", input: "" } },
    });
  });

  it("retains confirmed tags and input when a storage write is rejected", async () => {
    const existing = { key: "reference", label: "Reference" } as const;
    const states: LibraryState[] = [];
    const controller = createLibraryController({
      loadRows: async () => [row],
      loadTags: async () => ({ "native-one": [existing] }),
      writeTags: async () => Promise.reject(new TypeError("storage unavailable")),
      render: (state) => states.push(state),
    });

    await controller.bootstrap();
    await controller.addTag(row.id, "Design");

    expect(states.at(-1)).toMatchObject({
      kind: "ready",
      rows: [{ tags: [existing] }],
      tagStates: {
        "native-one": {
          kind: "error",
          input: "Design",
          message: "Tag could not be saved.",
        },
      },
    });
  });

  it("rethrows unexpected non-Error storage rejections without confirming the tag", async () => {
    const states: LibraryState[] = [];
    const controller = createLibraryController({
      loadRows: async () => [row],
      loadTags: async () => ({}),
      writeTags: async () => Promise.reject("unexpected"),
      render: (state) => states.push(state),
    });

    await controller.bootstrap();
    await expect(controller.addTag(row.id, "Design")).rejects.toBe("unexpected");
    expect(states.at(-1)).toMatchObject({ kind: "ready", rows: [{ tags: [] }] });
  });

  it("adds multiple tags and reuses first spelling without duplicate assignment", async () => {
    const writes: Array<{ readonly id: string; readonly tags: readonly TagRecord[] }> = [];
    const states: LibraryState[] = [];
    const controller = createLibraryController({
      loadRows: async () => [row, { ...row, id: "native-two", url: row.url }],
      loadTags: async () => ({}),
      writeTags: async (id, tags) => { writes.push({ id, tags }); },
      render: (state) => states.push(state),
    });
    await controller.bootstrap();

    await controller.addTag("native-one", " Design ");
    await controller.addTag("native-one", "Research");
    await controller.addTag("native-one", "design");
    await controller.addTag("native-two", "DESIGN");

    expect(writes).toEqual([
      { id: "native-one", tags: [{ key: "design", label: "Design" }] },
      {
        id: "native-one",
        tags: [
          { key: "design", label: "Design" },
          { key: "research", label: "Research" },
        ],
      },
      { id: "native-two", tags: [{ key: "design", label: "Design" }] },
    ]);
    expect(states.at(-1)).toMatchObject({
      kind: "ready",
      rows: [
        { id: "native-one", tags: [{ label: "Design" }, { label: "Research" }] },
        { id: "native-two", tags: [{ label: "Design" }] },
      ],
    });
  });
});
