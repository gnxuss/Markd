import { describe, expect, it } from "vitest";

import { createLibraryController } from "../../src/library/controller.js";
import { selectRows } from "../../src/library/selectors.js";
import type { BookmarkRow, LibraryState } from "../../src/types.js";

const design = { key: "design", label: "Design" } as const;
const research = { key: "research", label: "RESEARCH" } as const;
const rows = [
  {
    id: "native-alpha",
    title: "Alpha Handbook",
    url: "https://docs.example.com/Guide/Start",
    tags: [design, research],
    folderPath: "Work / Papers",
    note: "Primary reading list",
  },
  {
    id: "native-beta",
    title: "beta notes",
    url: "https://research.example.org/archive",
    tags: [design],
    folderPath: "Archive",
    note: "",
  },
  {
    id: "native-gamma",
    title: "Gamma",
    url: "https://other.example.net/path",
    tags: [],
    folderPath: "Personal",
    note: "Remember this later",
  },
] satisfies readonly BookmarkRow[];

describe("retrieval selection", () => {
  it("returns the current view unchanged in native order when criteria are empty", () => {
    expect(selectRows(rows, "all", { query: "", selectedTagKeys: [] })).toEqual(rows);
    expect(selectRows(rows, "untagged", { query: "", selectedTagKeys: [] })).toEqual([rows[2]]);
  });

  it.each([
    ["  ALPHA  ", ["native-alpha"]],
    ["EXAMPLE.ORG/ARCH", ["native-beta"]],
    ["docs.example", ["native-alpha"]],
    ["work", ["native-alpha"]],
    ["papers", ["native-alpha"]],
    ["primary reading", ["native-alpha"]],
    ["research", ["native-alpha", "native-beta"]],
    ["remember this", ["native-gamma"]],
  ])("matches trimmed case-insensitive title or raw URL query %s", (query, expectedIds) => {
    expect(selectRows(rows, "all", { query, selectedTagKeys: [] }).map((row) => row.id)).toEqual(expectedIds);
  });

  it("requires every selected canonical key without comparing display spelling", () => {
    expect(selectRows(rows, "all", { query: "", selectedTagKeys: ["design"] }).map((row) => row.id)).toEqual([
      "native-alpha",
      "native-beta",
    ]);
    expect(selectRows(rows, "all", { query: "", selectedTagKeys: ["design", "research"] })).toEqual([
      rows[0],
    ]);
  });

  it("composes view, query, and tag predicates with AND semantics", () => {
    expect(selectRows(rows, "all", { query: "guide", selectedTagKeys: ["design", "research"] })).toEqual([
      rows[0],
    ]);
    expect(selectRows(rows, "untagged", { query: "Gamma", selectedTagKeys: ["design"] })).toEqual([]);
  });
});

describe("retrieval criteria reconciliation", () => {
  it("drops a selected tag key only after its final confirmed assignment is removed", async () => {
    const states: LibraryState[] = [];
    const controller = createLibraryController({
      loadRows: async () => rows.slice(0, 2),
      loadTags: async () => ({
        "native-alpha": [design, research],
        "native-beta": [design],
      }),
      writeTags: async () => undefined,
      render: (state) => states.push(state),
    });
    await controller.bootstrap();
    controller.toggleTagFilter("design");

    await controller.removeTag("native-alpha", "design");
    expect(states.at(-1)).toMatchObject({
      kind: "ready",
      selectedTagKeys: ["design"],
      rows: [{ id: "native-beta" }],
    });

    await controller.removeTag("native-beta", "design");
    expect(states.at(-1)).toMatchObject({
      kind: "ready",
      selectedTagKeys: [],
      rows: [{ id: "native-alpha" }, { id: "native-beta" }],
    });
  });
});
