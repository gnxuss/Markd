import { describe, expect, it, vi } from "vitest";

import { createBookmarkDetails } from "../../src/library/bookmark-details.js";

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: Error) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((reason: Error) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  if (resolvePromise === undefined || rejectPromise === undefined) throw new TypeError("Deferred unavailable");
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

describe("bookmark details controller", () => {
  it("loads only the opened exact ID and exposes existing or empty notes", async () => {
    // Given: exact-ID note storage and an initially closed controller.
    const load = vi.fn(async (id: string) => id === "noted" ? "Existing note" : "");
    const controller = createBookmarkDetails({ load, write: vi.fn(), onState: vi.fn() });

    // When: note details are opened in sequence.
    await controller.toggle("noted");
    expect(controller.state("noted")).toEqual({ kind: "ready", bookmarkId: "noted", note: "Existing note", draft: "Existing note", message: "" });
    await controller.toggle("empty");

    // Then: each exact record remains addressable and absence is a ready empty state.
    expect(load).toHaveBeenNthCalledWith(1, "noted");
    expect(load).toHaveBeenNthCalledWith(2, "empty");
    expect(controller.state("noted").kind).toBe("ready");
    expect(controller.state("empty")).toEqual({ kind: "ready", bookmarkId: "empty", note: "", draft: "", message: "" });
  });

  it("retains drafts without rendering each keystroke and saves through the injected writer", async () => {
    // Given: ready details and an observable render port.
    const onState = vi.fn();
    const write = vi.fn(async () => undefined);
    const controller = createBookmarkDetails({ load: async () => "Old", write, onState });
    await controller.toggle("native-id");
    const rendersAfterOpen = onState.mock.calls.length;

    // When: the draft changes and is saved.
    controller.setDraft("native-id", "Edited note");
    expect(onState).toHaveBeenCalledTimes(rendersAfterOpen);
    await controller.save("native-id");

    // Then: the exact ID is written and confirmed state retains the draft.
    expect(write).toHaveBeenCalledWith("native-id", "Edited note");
    expect(controller.state("native-id")).toEqual({ kind: "ready", bookmarkId: "native-id", note: "Edited note", draft: "Edited note", message: "Note saved." });
  });

  it("retains a failed save draft and permits retry without concurrent writes", async () => {
    // Given: a writer that fails once then succeeds.
    const pending = deferred<void>();
    const write = vi.fn()
      .mockRejectedValueOnce(new TypeError("storage unavailable"))
      .mockImplementationOnce(() => pending.promise);
    const controller = createBookmarkDetails({ load: async () => "", write, onState: vi.fn() });
    await controller.toggle("native-id");
    controller.setDraft("native-id", "Retry me");
    await controller.save("native-id");

    // When: the failed save is retried and another save is attempted concurrently.
    expect(controller.state("native-id")).toMatchObject({ kind: "error", bookmarkId: "native-id", draft: "Retry me", operation: "save" });
    const retry = controller.retry("native-id");
    await controller.save("native-id");
    pending.resolve();
    await retry;

    // Then: one retry writes and the retained draft becomes confirmed.
    expect(write).toHaveBeenCalledTimes(2);
    expect(controller.state("native-id")).toMatchObject({ kind: "ready", note: "Retry me", draft: "Retry me" });
  });

  it("rejects stale loads after closure and disposal", async () => {
    // Given: two controllable exact-ID reads.
    const first = deferred<string>();
    const second = deferred<string>();
    const load = vi.fn((id: string) => id === "first" ? first.promise : second.promise);
    const controller = createBookmarkDetails({ load, write: vi.fn(), onState: vi.fn() });

    // When: one row closes while loading and another remains independent.
    const firstOpen = controller.toggle("first");
    const secondOpen = controller.toggle("second");
    await controller.toggle("first");
    first.resolve("stale");
    await firstOpen;
    second.resolve("current");
    await secondOpen;
    controller.dispose();

    // Then: stale work never reopens a closed row and disposal closes every row.
    expect(controller.state("first")).toEqual({ kind: "closed" });
    expect(controller.state("second")).toEqual({ kind: "closed" });
  });

  it("opens and closes all supplied IDs while retaining only the current page", async () => {
    const load = vi.fn(async (id: string) => `Note ${id}`);
    const controller = createBookmarkDetails({ load, write: vi.fn(), onState: vi.fn() });

    await controller.openAll(["first", "second"]);
    expect(controller.areAllOpen(["first", "second"])).toBe(true);
    expect(controller.state("first")).toMatchObject({ kind: "ready", note: "Note first" });
    expect(controller.state("second")).toMatchObject({ kind: "ready", note: "Note second" });

    controller.retain(["second"]);
    expect(controller.state("first")).toEqual({ kind: "closed" });
    controller.closeAll(["second"]);
    expect(controller.areAllOpen(["second"])).toBe(false);
  });
});
