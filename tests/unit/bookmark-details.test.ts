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
    await controller.open("noted");
    expect(controller.state()).toEqual({ kind: "ready", bookmarkId: "noted", note: "Existing note", draft: "Existing note", message: "" });
    await controller.open("empty");

    // Then: one exact record remains active and absence is a ready empty state.
    expect(load).toHaveBeenNthCalledWith(1, "noted");
    expect(load).toHaveBeenNthCalledWith(2, "empty");
    expect(controller.state()).toEqual({ kind: "ready", bookmarkId: "empty", note: "", draft: "", message: "" });
  });

  it("retains drafts without rendering each keystroke and saves through the injected writer", async () => {
    // Given: ready details and an observable render port.
    const onState = vi.fn();
    const write = vi.fn(async () => undefined);
    const controller = createBookmarkDetails({ load: async () => "Old", write, onState });
    await controller.open("native-id");
    const rendersAfterOpen = onState.mock.calls.length;

    // When: the draft changes and is saved.
    controller.setDraft("Edited note");
    expect(onState).toHaveBeenCalledTimes(rendersAfterOpen);
    await controller.save();

    // Then: the exact ID is written and confirmed state retains the draft.
    expect(write).toHaveBeenCalledWith("native-id", "Edited note");
    expect(controller.state()).toEqual({ kind: "ready", bookmarkId: "native-id", note: "Edited note", draft: "Edited note", message: "Note saved." });
  });

  it("retains a failed save draft and permits retry without concurrent writes", async () => {
    // Given: a writer that fails once then succeeds.
    const pending = deferred<void>();
    const write = vi.fn()
      .mockRejectedValueOnce(new TypeError("storage unavailable"))
      .mockImplementationOnce(() => pending.promise);
    const controller = createBookmarkDetails({ load: async () => "", write, onState: vi.fn() });
    await controller.open("native-id");
    controller.setDraft("Retry me");
    await controller.save();

    // When: the failed save is retried and another save is attempted concurrently.
    expect(controller.state()).toMatchObject({ kind: "error", bookmarkId: "native-id", draft: "Retry me", operation: "save" });
    const retry = controller.retry();
    await controller.save();
    pending.resolve();
    await retry;

    // Then: one retry writes and the retained draft becomes confirmed.
    expect(write).toHaveBeenCalledTimes(2);
    expect(controller.state()).toMatchObject({ kind: "ready", note: "Retry me", draft: "Retry me" });
  });

  it("rejects stale loads after replacement, closure, and disposal", async () => {
    // Given: two controllable exact-ID reads.
    const first = deferred<string>();
    const second = deferred<string>();
    const load = vi.fn((id: string) => id === "first" ? first.promise : second.promise);
    const controller = createBookmarkDetails({ load, write: vi.fn(), onState: vi.fn() });

    // When: a second row replaces the first before either read resolves.
    const firstOpen = controller.open("first");
    const secondOpen = controller.open("second");
    first.resolve("stale");
    await firstOpen;
    second.resolve("current");
    await secondOpen;
    controller.close();
    controller.dispose();

    // Then: stale work never replaces the latest state and disposal stays closed.
    expect(controller.state()).toEqual({ kind: "closed" });
  });
});
