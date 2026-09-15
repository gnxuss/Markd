import { describe, expect, it, vi } from "vitest";

import { createLibraryController } from "../../src/library/controller.js";
import { selectRows } from "../../src/library/selectors.js";
import type { BookmarkLibrarySnapshot, BookmarkRow, LibraryState } from "../../src/types.js";

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

function withFolder(row: BookmarkRow | undefined, folderId: string): BookmarkRow {
  if (row === undefined) throw new TypeError("Bookmark row fixture unavailable");
  return { ...row, folderId };
}

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

  it("keeps a selected native folder through rename and clears it after deletion", async () => {
    // Given: a selected parent folder with direct, descendant, and sibling bookmarks.
    const snapshots: BookmarkLibrarySnapshot[] = [{
      folders: [{ id: "work", title: "Work", children: [{ id: "deep", title: "Deep", children: [] }] }, {
        id: "personal", title: "Personal", children: [],
      }],
      rows: [
        withFolder(rows[0], "work"),
        withFolder(rows[1], "deep"),
        withFolder(rows[2], "personal"),
      ],
    }, {
      folders: [{ id: "work", title: "Renamed Work", children: [{ id: "deep", title: "Deep", children: [] }] }],
      rows: [withFolder(rows[0], "work"), withFolder(rows[1], "deep")],
    }, {
      folders: [{ id: "personal", title: "Personal", children: [] }],
      rows: [withFolder(rows[2], "personal")],
    }];
    const observed: LibraryState[] = [];
    const loadLibrary = vi.fn(async () => {
      const snapshot = snapshots.shift();
      if (snapshot === undefined) throw new TypeError("Native snapshot unavailable");
      return snapshot;
    });
    const controller = createLibraryController({ loadLibrary, render: (state) => observed.push(state) });
    await controller.bootstrap();

    // When: the parent is selected, renamed on refresh, then deleted on refresh.
    controller.selectFolder("work");
    const selectedState = observed.at(-1);
    await controller.refresh();
    const renamedState = observed.at(-1);
    await controller.refresh();

    // Then: filtering includes descendants by ID and only deletion clears the criterion.
    expect(selectedState).toMatchObject({
      kind: "ready",
      selectedFolderId: "work",
      rows: [{ id: "native-alpha" }, { id: "native-beta" }],
    });
    expect(renamedState).toMatchObject({ kind: "ready", selectedFolderId: "work" });
    expect(observed.at(-1)).toMatchObject({ kind: "ready" });
    expect(observed.at(-1)).not.toHaveProperty("selectedFolderId");
  });

  it("composes folder selection with search and tag criteria without extra loads", async () => {
    // Given: one loaded native snapshot and active search and tag criteria.
    const loadLibrary = vi.fn(async (): Promise<BookmarkLibrarySnapshot> => ({
      folders: [{ id: "work", title: "Work", children: [{ id: "deep", title: "Deep", children: [] }] }],
      rows: [withFolder(rows[0], "work"), withFolder(rows[1], "deep"), withFolder(rows[2], "elsewhere")],
    }));
    const observed: LibraryState[] = [];
    const controller = createLibraryController({
      loadLibrary,
      loadTags: async () => ({ "native-alpha": [design, research], "native-beta": [design] }),
      render: (state) => observed.push(state),
    });
    await controller.bootstrap();

    // When: folder, search, and tag filters are combined in memory.
    controller.selectFolder("work");
    controller.setSearch("alpha");
    controller.toggleTagFilter("research");

    // Then: all criteria remain active and the native tree is not read again.
    expect(observed.at(-1)).toMatchObject({
      kind: "ready",
      selectedFolderId: "work",
      query: "alpha",
      selectedTagKeys: ["research"],
      rows: [{ id: "native-alpha" }],
    });
    expect(loadLibrary).toHaveBeenCalledTimes(1);
  });
});
