import { describe, expect, it, vi } from "vitest";

import { buildTagSuggestions, createQuickSaveController } from "../../src/quick-save/controller.js";

describe("Quick Save controller", () => {
  it("creates once and stores the canonical tag under the returned native ID", async () => {
    // Given: a new-page controller with narrow Chromium adapters.
    const createBookmark = vi.fn(async () => ({ id: "created-42" }));
    const writeTags = vi.fn(async () => undefined);
    const controller = createQuickSaveController({
      createBookmark,
      writeTags,
      writeNote: async () => undefined,
      updateRecent: async () => undefined,
      onState: () => undefined,
    }, {
      page: { title: "Example", url: "https://example.com/new", domain: "example.com" },
      folders: [{ id: "folder", label: "Bookmarks bar / Research" }],
      matches: [],
      bookmarkIds: [],
    });

    // When: a canonical tag is selected and the form submits.
    controller.addTag("  Design  ");
    await controller.submit("folder");

    // Then: native creation precedes exact returned-ID metadata persistence.
    expect(createBookmark).toHaveBeenCalledWith({
      parentId: "folder", title: "Example", url: "https://example.com/new",
    });
    expect(writeTags).toHaveBeenCalledWith("created-42", [{ key: "design", label: "Design" }]);
  });

  it("updates only the first exact native-ID match without creating or moving it", async () => {
    // Given: two intentional equal-URL bookmarks in authoritative tree order.
    const createBookmark = vi.fn(async () => ({ id: "unexpected" }));
    const writeTags = vi.fn(async () => undefined);
    const writeNote = vi.fn(async () => undefined);
    const controller = createQuickSaveController({ createBookmark, writeTags, writeNote,
      updateRecent: async () => undefined, onState: () => undefined }, {
      page: { title: "Duplicate", url: "https://duplicate.example/same", domain: "duplicate.example" },
      folders: [{ id: "one", label: "Bookmarks bar / One" }, { id: "two", label: "Bookmarks bar / Two" }],
      matches: [
        { id: "first", title: "First", folderId: "one", folderLabel: "Bookmarks bar / One" },
        { id: "second", title: "Second", folderId: "two", folderLabel: "Bookmarks bar / Two" },
      ],
      bookmarkIds: ["first", "second"],
    }, { tags: [{ key: "old", label: "Old" }], note: "context", recentTags: [], catalogTags: [] });

    // When: metadata is changed and submitted.
    controller.removeTag("old");
    controller.addTag("Design");
    controller.setNote(" updated ");
    await controller.submit("two");

    // Then: no native mutation occurs and only the deterministic target is written.
    expect(createBookmark).not.toHaveBeenCalled();
    expect(writeTags).toHaveBeenCalledWith("first", [{ key: "design", label: "Design" }]);
    expect(writeNote).toHaveBeenCalledWith("first", "updated");
  });

  it("retains a created target after metadata failure so retry cannot duplicate it", async () => {
    // Given: native creation succeeds before the first metadata write fails.
    const createBookmark = vi.fn(async () => ({ id: "created-once" }));
    const writeTags = vi.fn()
      .mockRejectedValueOnce(new TypeError("storage unavailable"))
      .mockResolvedValue(undefined);
    const controller = createQuickSaveController({ createBookmark, writeTags,
      writeNote: async () => undefined, updateRecent: async () => undefined,
      onState: () => undefined }, {
      page: { title: "New", url: "https://new.example", domain: "new.example" },
      folders: [{ id: "folder", label: "Bookmarks bar" }], matches: [],
      bookmarkIds: [],
    }, { tags: [], note: "", recentTags: [], catalogTags: [] });
    controller.addTag("Design");

    // When: the user retries the failed submission.
    await controller.submit("folder");
    await controller.submit("folder");

    // Then: the retained exact ID receives metadata and create ran only once.
    expect(createBookmark).toHaveBeenCalledTimes(1);
    expect(writeTags).toHaveBeenLastCalledWith("created-once", [{ key: "design", label: "Design" }]);
    expect(controller.state().targetId).toBe("created-once");
  });

  it("offers canonical matches or creation while excluding selected tags", () => {
    // Given: catalog, recent, and selected tag records.
    const catalog = [{ key: "design", label: "Design" }, { key: "research", label: "Research" }];

    // When: suggestions are derived for partial and new input.
    const matching = buildTagSuggestions("des", catalog, [{ key: "research", label: "Research" }]);
    const creation = buildTagSuggestions("Reference", catalog, []);

    // Then: matches are canonical and new labels are offered exactly once.
    expect(matching).toEqual([
      { kind: "existing", tag: { key: "design", label: "Design" } },
      { kind: "create", tag: { key: "des", label: "des" } },
    ]);
    expect(creation).toEqual([{ kind: "create", tag: { key: "reference", label: "Reference" } }]);
  });

  it("blocks a second submit while the first mutation is pending", async () => {
    // Given: a create operation held in flight.
    let release: (() => void) | undefined;
    const createBookmark = vi.fn(() => new Promise<{ readonly id: string }>((resolve) => {
      release = () => resolve({ id: "created-42" });
    }));
    const controller = createQuickSaveController({
      createBookmark,
      writeTags: async () => undefined,
      writeNote: async () => undefined,
      updateRecent: async () => undefined,
      onState: () => undefined,
    }, {
      page: { title: "Example", url: "https://example.com/new", domain: "example.com" },
      folders: [{ id: "folder", label: "Bookmarks bar" }],
      matches: [],
      bookmarkIds: [],
    });

    // When: submit is invoked twice before Chromium settles.
    const first = controller.submit("folder");
    const second = controller.submit("folder");
    release?.();
    await Promise.all([first, second]);

    // Then: only one native mutation runs.
    expect(createBookmark).toHaveBeenCalledTimes(1);
  });
});
