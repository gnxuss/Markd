import { describe, expect, it } from "vitest";

import { tagSuggestions } from "../../src/library/tag-editor.js";
import { createLibraryController } from "../../src/library/controller.js";
import type { BookmarkRow, LibraryState } from "../../src/types.js";

const row: BookmarkRow = {
  id: "native-one",
  title: "Example",
  url: "https://example.com/reference",
  tags: [{ key: "design", label: "Design" }],
};

describe("tag editor suggestions", () => {
  it("places matching confirmed tags before a create choice", () => {
    const catalog = [
      { key: "design", label: "Design" },
      { key: "research", label: "Research" },
    ] as const;
    expect(tagSuggestions("des", catalog)).toEqual([
      { kind: "existing", tag: catalog[0] },
      { kind: "create", input: "des", label: "Create “des”" },
    ]);
  });

  it("offers reuse without create for an exact canonical match", () => {
    const design = { key: "design", label: "Design" } as const;
    expect(tagSuggestions(" DESIGN ", [design])).toEqual([{ kind: "existing", tag: design }]);
  });

  it("offers no choice for empty input", () => {
    expect(tagSuggestions("  ", [{ key: "design", label: "Design" }])).toEqual([]);
  });
});

describe("tag editor durable transitions", () => {
  it("clears and requests input focus only after a successful add", async () => {
    const states: LibraryState[] = [];
    const controller = createLibraryController({
      loadRows: async () => [{ ...row, tags: [] }],
      loadTags: async () => ({}),
      writeTags: async () => undefined,
      render: (state) => states.push(state),
    });
    await controller.bootstrap();

    await controller.addTag(row.id, "Design");

    expect(states.at(-1)).toMatchObject({
      kind: "ready",
      tagStates: { "native-one": { kind: "idle", input: "", focus: true } },
    });
  });

  it("keeps a chip and shows local feedback when removal fails", async () => {
    const states: LibraryState[] = [];
    const controller = createLibraryController({
      loadRows: async () => [row],
      loadTags: async () => ({ "native-one": row.tags }),
      writeTags: async () => Promise.reject(new TypeError("storage unavailable")),
      render: (state) => states.push(state),
    });
    await controller.bootstrap();

    await controller.removeTag(row.id, "design");

    expect(states.at(-1)).toMatchObject({
      kind: "ready",
      rows: [{ tags: [{ key: "design", label: "Design" }] }],
      tagStates: { "native-one": { kind: "error", message: "Tag could not be removed." } },
    });
  });
});
