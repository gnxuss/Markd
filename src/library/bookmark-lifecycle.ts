type LifecycleSignal = {
  readonly addListener: (listener: () => void) => void;
  readonly removeListener: (listener: () => void) => void;
};

export type BookmarkLifecycleEvents = {
  readonly onCreated: LifecycleSignal;
  readonly onChanged: LifecycleSignal;
  readonly onMoved: LifecycleSignal;
  readonly onRemoved: LifecycleSignal;
  readonly onChildrenReordered: LifecycleSignal;
  readonly onImportBegan: LifecycleSignal;
  readonly onImportEnded: LifecycleSignal;
};

export type BookmarkLifecycle = {
  readonly start: () => Promise<void>;
  readonly whenIdle: () => Promise<void>;
  readonly dispose: () => void;
};

export function subscribeBookmarkLifecycle(
  events: BookmarkLifecycleEvents,
  refresh: () => Promise<void>,
): BookmarkLifecycle {
  let pending = false;
  let importing = false;
  let deferredImportCreate = false;
  let running: Promise<void> | undefined;

  const queueRefresh = (): Promise<void> => {
    pending = true;
    if (running !== undefined) return running;
    running = (async (): Promise<void> => {
      try {
        while (pending) {
          pending = false;
          await refresh();
        }
      } finally {
        running = undefined;
      }
    })();
    return running;
  };
  const invalidate = (): void => { void queueRefresh(); };
  const created = (): void => {
    if (importing) {
      deferredImportCreate = true;
      return;
    }
    invalidate();
  };
  const importBegan = (): void => { importing = true; };
  const importEnded = (): void => {
    importing = false;
    if (deferredImportCreate) deferredImportCreate = false;
    invalidate();
  };
  const invalidationSignals = [
    events.onChanged,
    events.onMoved,
    events.onRemoved,
    events.onChildrenReordered,
  ] as const;

  events.onCreated.addListener(created);
  for (const signal of invalidationSignals) signal.addListener(invalidate);
  events.onImportBegan.addListener(importBegan);
  events.onImportEnded.addListener(importEnded);

  return {
    start: queueRefresh,
    whenIdle: async (): Promise<void> => {
      while (running !== undefined) await running;
    },
    dispose: (): void => {
      events.onCreated.removeListener(created);
      for (const signal of invalidationSignals) signal.removeListener(invalidate);
      events.onImportBegan.removeListener(importBegan);
      events.onImportEnded.removeListener(importEnded);
    },
  };
}
