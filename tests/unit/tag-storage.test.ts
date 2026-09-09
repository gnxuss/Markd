import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadTagAssignments,
  writeBookmarkTags,
} from "../../src/tags/chrome-tag-storage.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Chrome tag storage", () => {
  it("loads only valid versioned native-ID assignments", async () => {
    const get = vi.fn(async () => ({
      "bookmark-tags:1:native-one": {
        version: 1,
        tags: [{ key: "design", label: "Design" }],
      },
      "bookmark-tags:1:malformed": {
        version: 1,
        tags: [{ key: "wrong", label: "Design" }],
      },
      "bookmark-tags:2:future": {
        version: 2,
        tags: [{ key: "future", label: "Future" }],
      },
      unrelated: { title: "Native title", url: "https://example.com" },
    }));
    vi.stubGlobal("chrome", { storage: { local: { get } } });

    await expect(loadTagAssignments()).resolves.toEqual({
      "native-one": [{ key: "design", label: "Design" }],
    });
  });

  it("removes the per-bookmark key when the final assignment is removed", async () => {
    const set = vi.fn(async (_items: Record<string, unknown>) => undefined);
    const remove = vi.fn(async (_key: string) => undefined);
    vi.stubGlobal("chrome", { storage: { local: { set, remove } } });

    await writeBookmarkTags("native-one", []);

    expect(remove).toHaveBeenCalledWith("bookmark-tags:1:native-one");
    expect(set).not.toHaveBeenCalled();
  });

  it("serializes writes for one native ID while allowing different IDs independently", async () => {
    const resolvers: Array<() => void> = [];
    const set = vi.fn(
      (_items: Record<string, unknown>) => new Promise<void>((resolve) => { resolvers.push(resolve); }),
    );
    const remove = vi.fn(async (_key: string) => undefined);
    vi.stubGlobal("chrome", { storage: { local: { set, remove } } });

    const first = writeBookmarkTags("native-one", [{ key: "one", label: "One" }]);
    const second = writeBookmarkTags("native-one", [{ key: "two", label: "Two" }]);
    const independent = writeBookmarkTags("native-two", [{ key: "other", label: "Other" }]);
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(2));
    expect(set.mock.calls[0]?.[0]).toHaveProperty("bookmark-tags:1:native-one");
    expect(set.mock.calls[1]?.[0]).toHaveProperty("bookmark-tags:1:native-two");

    resolvers[0]?.();
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(3));
    resolvers[1]?.();
    resolvers[2]?.();
    await Promise.all([first, second, independent]);
  });
});
