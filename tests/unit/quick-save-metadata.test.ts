import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bookmarkIdFromNoteKey,
  listBookmarkNoteIds,
  loadBookmarkNote,
  loadRecentTags,
  removeBookmarkNotes,
  updateRecentTags,
  writeBookmarkNote,
} from "../../src/quick-save/metadata-storage.js";

afterEach(() => vi.unstubAllGlobals());

describe("Quick Save metadata storage", () => {
  it("parses only current version note and recent-tag payloads", async () => {
    // Given: valid, malformed, future, and unrelated local values.
    const get = vi.fn(async () => ({
      "bookmark-note:1:native": { version: 1, note: "  useful context  " },
      "recent-tags:1": { version: 1, tags: [
        { key: "design", label: "Design" }, { key: "design", label: "DESIGN" },
        { key: "research", label: "Research" },
      ] },
    }));
    vi.stubGlobal("chrome", { storage: { local: { get } } });

    // When: exact metadata is loaded.
    const [note, recent] = await Promise.all([loadBookmarkNote("native"), loadRecentTags()]);

    // Then: values are trimmed, canonical, unique, and exact-key reads are used.
    expect(note).toBe("useful context");
    expect(recent).toEqual([{ key: "design", label: "Design" }, { key: "research", label: "Research" }]);
    expect(get).toHaveBeenCalledWith("bookmark-note:1:native");
    expect(get).toHaveBeenCalledWith("recent-tags:1");
  });

  it("removes empty notes and caps successful recent tags at eight", async () => {
    // Given: an empty note and ten newly committed canonical tags.
    const get = vi.fn(async () => ({ "recent-tags:1": { version: 1, tags: [] } }));
    const set = vi.fn(async (_items: Record<string, unknown>) => undefined);
    const remove = vi.fn(async (_keys: string | readonly string[]) => undefined);
    vi.stubGlobal("chrome", { storage: { local: { get, set, remove } } });
    const tags = Array.from({ length: 10 }, (_, index) => ({ key: `tag ${index}`, label: `Tag ${index}` }));

    // When: note and successful tag metadata are committed.
    await writeBookmarkNote("native", "   ");
    await updateRecentTags(tags);

    // Then: the note key is removed and only the eight most recent unique tags persist.
    expect(remove).toHaveBeenCalledWith("bookmark-note:1:native");
    expect(set).toHaveBeenCalledWith({ "recent-tags:1": { version: 1, tags: tags.slice(0, 8) } });
  });

  it("enumerates and removes only exact bookmark note keys", async () => {
    // Given: current note keys alongside recent and unrelated values.
    const get = vi.fn(async () => ({
      "bookmark-note:1:first": "owned", "bookmark-note:1:second": "owned",
      "bookmark-note:1:": "invalid", "bookmark-note:2:future": "future", "recent-tags:1": {},
    }));
    const remove = vi.fn(async (_keys: readonly string[]) => undefined);
    vi.stubGlobal("chrome", { storage: { local: { get, remove } } });

    // When: note ownership is enumerated and cleaned.
    const ids = await listBookmarkNoteIds();
    await removeBookmarkNotes(ids);

    // Then: only exact native-ID note keys participate.
    expect(ids).toEqual(["first", "second"]);
    expect(bookmarkIdFromNoteKey("bookmark-note:1:first")).toBe("first");
    expect(remove).toHaveBeenCalledWith(["bookmark-note:1:first", "bookmark-note:1:second"]);
  });
});
