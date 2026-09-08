import { afterEach, describe, expect, it, vi } from "vitest";

import { openBookmark } from "../../src/browser/open-tab.js";
import { createLibraryController } from "../../src/library/controller.js";
import type { BookmarkRow, LibraryState } from "../../src/types.js";

const row: BookmarkRow = {
  id: "native-one",
  title: "Example",
  url: "https://example.com/exact?native=true",
  tags: [],
};

function activation(button: number, options: { readonly ctrl?: boolean; readonly meta?: boolean; readonly nested?: boolean } = {}) {
  return {
    button,
    ctrlKey: options.ctrl ?? false,
    metaKey: options.meta ?? false,
    nestedInteractive: options.nested ?? false,
    preventDefault: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openBookmark", () => {
  it.each([
    ["ordinary primary", activation(0), true],
    ["control primary", activation(0, { ctrl: true }), false],
    ["meta primary", activation(0, { meta: true }), false],
    ["middle", activation(1), false],
  ])("opens one exact native URL for %s activation", async (_name, event, expectedActive) => {
    const create = vi.fn(async () => undefined);
    vi.stubGlobal("chrome", { tabs: { create } });
    const controller = createLibraryController({
      loadRows: async () => [row],
      open: openBookmark,
      render: vi.fn(),
      schedule: vi.fn(),
    });
    await controller.bootstrap();
    await controller.activate(event, row);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ active: expectedActive, url: row.url });
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("ignores nested interactive targets without owning their navigation", async () => {
    const open = vi.fn(async () => undefined);
    const render = vi.fn();
    const controller = createLibraryController({ loadRows: async () => [row], open, render, schedule: vi.fn() });
    await controller.bootstrap();
    const event = activation(0, { nested: true });
    await controller.activate(event, row);
    expect(open).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("isolates rejection feedback to the activated native ID and clears it deterministically", async () => {
    const states: LibraryState[] = [];
    const scheduledCallbacks: Array<() => void> = [];
    const controller = createLibraryController({
      loadRows: async () => [row, { ...row, id: "native-two" }],
      open: async () => Promise.reject(new TypeError("tabs unavailable")),
      render: (state) => states.push(state),
      schedule: (callback, duration) => {
        expect(duration).toBe(3_000);
        scheduledCallbacks.push(callback);
      },
    });
    await controller.bootstrap();
    await controller.activate(activation(0), row);
    const failure = states.at(-1);
    expect(failure).toMatchObject({
      kind: "ready",
      rowStates: { "native-one": { kind: "error" } },
    });
    expect(failure).not.toMatchObject({ rowStates: { "native-two": { kind: "error" } } });
    scheduledCallbacks[0]?.();
    expect(states.at(-1)).toMatchObject({ kind: "ready", rowStates: {} });
  });
});
