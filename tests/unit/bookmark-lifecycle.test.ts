import { describe, expect, it, vi } from "vitest";

import {
  subscribeBookmarkLifecycle,
  type BookmarkLifecycleEvents,
} from "../../src/library/bookmark-lifecycle.js";

class TestSignal {
  readonly listeners = new Set<() => void>();

  addListener(listener: () => void): void {
    this.listeners.add(listener);
  }

  removeListener(listener: () => void): void {
    this.listeners.delete(listener);
  }

  emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function createEvents(): BookmarkLifecycleEvents & {
  readonly created: TestSignal;
  readonly changed: TestSignal;
  readonly moved: TestSignal;
  readonly removed: TestSignal;
  readonly reordered: TestSignal;
  readonly importBegan: TestSignal;
  readonly importEnded: TestSignal;
} {
  const created = new TestSignal();
  const changed = new TestSignal();
  const moved = new TestSignal();
  const removed = new TestSignal();
  const reordered = new TestSignal();
  const importBegan = new TestSignal();
  const importEnded = new TestSignal();
  return {
    created,
    changed,
    moved,
    removed,
    reordered,
    importBegan,
    importEnded,
    onCreated: created,
    onChanged: changed,
    onMoved: moved,
    onRemoved: removed,
    onChildrenReordered: reordered,
    onImportBegan: importBegan,
    onImportEnded: importEnded,
  };
}

describe("bookmark lifecycle", () => {
  it("registers every listener synchronously before starting the initial refresh", async () => {
    const events = createEvents();
    const refresh = vi.fn(async () => undefined);

    const lifecycle = subscribeBookmarkLifecycle(events, refresh);

    expect([
      events.created,
      events.changed,
      events.moved,
      events.removed,
      events.reordered,
      events.importBegan,
      events.importEnded,
    ].every((event) => event.listeners.size === 1)).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
    await lifecycle.start();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("serializes a burst and converges with one trailing authoritative refresh", async () => {
    const events = createEvents();
    let finishFirst: (() => void) | undefined;
    const refresh = vi.fn(() => refresh.mock.calls.length === 1
      ? new Promise<void>((resolve) => { finishFirst = resolve; })
      : Promise.resolve());
    const lifecycle = subscribeBookmarkLifecycle(events, refresh);

    const starting = lifecycle.start();
    events.changed.emit();
    events.moved.emit();
    events.reordered.emit();
    expect(refresh).toHaveBeenCalledTimes(1);
    finishFirst?.();
    await starting;

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("defers create churn during import and refreshes once when import ends", async () => {
    const events = createEvents();
    const refresh = vi.fn(async () => undefined);
    const lifecycle = subscribeBookmarkLifecycle(events, refresh);
    await lifecycle.start();

    events.importBegan.emit();
    events.created.emit();
    events.created.emit();
    expect(refresh).toHaveBeenCalledTimes(1);
    events.importEnded.emit();
    await lifecycle.whenIdle();

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("removes every listener when disposed", () => {
    const events = createEvents();
    const lifecycle = subscribeBookmarkLifecycle(events, async () => undefined);

    lifecycle.dispose();

    expect([
      events.created,
      events.changed,
      events.moved,
      events.removed,
      events.reordered,
      events.importBegan,
      events.importEnded,
    ].every((event) => event.listeners.size === 0)).toBe(true);
  });
});
