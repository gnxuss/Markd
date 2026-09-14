import { describe, expect, it, vi } from "vitest";

import { createQuickSaveController } from "../../src/quick-save/controller.js";

describe("Quick Save controller", () => {
  it("creates once and stores the canonical tag under the returned native ID", async () => {
    // Given: a new-page controller with narrow Chromium adapters.
    const createBookmark = vi.fn(async () => ({ id: "created-42" }));
    const writeTags = vi.fn(async () => undefined);
    const controller = createQuickSaveController({
      createBookmark,
      writeTags,
      onState: () => undefined,
    }, {
      page: { title: "Example", url: "https://example.com/new", domain: "example.com" },
      folders: [{ id: "folder", label: "Bookmarks bar / Research" }],
      matches: [],
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

  it("blocks a second submit while the first mutation is pending", async () => {
    // Given: a create operation held in flight.
    let release: (() => void) | undefined;
    const createBookmark = vi.fn(() => new Promise<{ readonly id: string }>((resolve) => {
      release = () => resolve({ id: "created-42" });
    }));
    const controller = createQuickSaveController({
      createBookmark,
      writeTags: async () => undefined,
      onState: () => undefined,
    }, {
      page: { title: "Example", url: "https://example.com/new", domain: "example.com" },
      folders: [{ id: "folder", label: "Bookmarks bar" }],
      matches: [],
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
