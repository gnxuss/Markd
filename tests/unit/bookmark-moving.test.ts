import { describe, expect, it, vi } from "vitest";

import { createBookmarkMoving, folderDestinations } from "../../src/library/bookmark-moving.js";
import { createBulkOrganization } from "../../src/library/bulk-organization.js";
import type { BookmarkRow, NativeFolderNode } from "../../src/types.js";

const folders = [
  { id: "work", title: "Work", children: [
    { id: "nested", title: "Reports", children: [] },
    { id: "same-a", title: "Same", children: [] },
    { id: "same-b", title: "Same", children: [] },
  ] },
  { id: "personal", title: "Personal", children: [] },
] satisfies readonly NativeFolderNode[];

const rows = [
  { id: "one", title: "One", url: "https://duplicate.example/item", folderId: "work", tags: [] },
  { id: "two", title: "Two", url: "https://duplicate.example/item", folderId: "personal", tags: [] },
  { id: "three", title: "Three", url: "https://three.example", folderId: "work", tags: [] },
] satisfies readonly BookmarkRow[];

describe("bookmark moving", () => {
  it("projects ordered breadcrumb destinations while retaining same-title IDs", () => {
    // Given: nested folders containing equal display titles.
    // When: destinations are projected from the loaded snapshot.
    const destinations = folderDestinations(folders);

    // Then: hierarchy is visible and native IDs remain distinct and ordered.
    expect(destinations).toEqual([
      { id: "work", label: "Work" },
      { id: "nested", label: "Work / Reports" },
      { id: "same-a", label: "Work / Same" },
      { id: "same-b", label: "Work / Same" },
      { id: "personal", label: "Personal" },
    ]);
  });

  it("rejects stale destinations and skips current-parent moves", async () => {
    // Given: one exact bookmark and a narrow native mover.
    const nativeMove = vi.fn(async () => undefined);
    const moving = createBookmarkMoving(nativeMove);

    // When: a forged destination and the current parent are requested.
    const stale = await moving.moveOne({ bookmarkId: "one", currentParentId: "work", destinationId: "missing", folders });
    const unchanged = await moving.moveOne({ bookmarkId: "one", currentParentId: "work", destinationId: "work", folders });

    // Then: neither request reaches Chromium.
    expect(stale).toEqual({ kind: "invalid-destination", destinationId: "missing" });
    expect(unchanged).toEqual({ kind: "unchanged", bookmarkId: "one" });
    expect(nativeMove).not.toHaveBeenCalled();
  });

  it("moves duplicate URLs by exact ID with fixed bounded concurrency and ordered results", async () => {
    // Given: controllable native moves with one expected failure.
    let active = 0;
    let maximumActive = 0;
    const releases: Array<() => void> = [];
    const nativeMove = vi.fn(async (id: string) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => { releases.push(resolve); });
      active -= 1;
      if (id === "two") throw new TypeError("blocked");
    });
    const moving = createBookmarkMoving(nativeMove, 2);

    // When: exact IDs with duplicate URLs and one current-parent no-op are moved.
    const pending = moving.moveMany(["one", "two", "three", "deleted"], rows, "nested", folders);
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.shift()?.();
    releases.shift()?.();
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases.shift()?.();
    const result = await pending;

    // Then: calls remain bounded and result groups preserve selection order.
    expect(maximumActive).toBe(2);
    expect(nativeMove.mock.calls.map(([id]) => id)).toEqual(["one", "two", "three"]);
    expect(result).toEqual({
      kind: "settled",
      movedIds: ["one", "three"],
      unchangedIds: [],
      failedIds: ["two"],
    });
  });

  it("retains only failed bulk IDs and blocks overlapping tag or move work", async () => {
    // Given: a bulk selection whose first move partially fails.
    let failTwo = true;
    let release: (() => void) | undefined;
    const moving = createBookmarkMoving(async (id) => {
      if (id === "one") await new Promise<void>((resolve) => { release = resolve; });
      if (id === "two" && failTwo) throw new TypeError("blocked");
    }, 2);
    const write = vi.fn(async () => undefined);
    const bulk = createBulkOrganization({
      rows: () => rows,
      write,
      commit: vi.fn(),
      onState: vi.fn(),
      folders: () => folders,
      moving,
    });
    bulk.enter();
    bulk.toggle("one");
    bulk.toggle("two");
    bulk.setDestination("nested");

    // When: movement begins and overlapping work is attempted before retry.
    const first = bulk.move();
    const overlapping = bulk.move();
    await bulk.apply("add");
    release?.();
    await Promise.all([first, overlapping]);

    // Then: only the failed exact ID remains and retry invokes only it.
    expect(write).not.toHaveBeenCalled();
    expect(bulk.state()).toMatchObject({
      status: "error",
      selectedIds: ["two"],
      destinationId: "nested",
      message: "1 bookmark could not be moved.",
    });
    failTwo = false;
    await bulk.move();
    expect(bulk.state()).toMatchObject({ status: "success", selectedIds: [], destinationId: "nested" });
  });
});
