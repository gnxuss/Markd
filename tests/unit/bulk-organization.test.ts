import { describe, expect, it, vi } from "vitest";

import { createBulkOrganization } from "../../src/library/bulk-organization.js";
import type { BookmarkRow, TagRecord } from "../../src/types.js";

const design = { key: "design", label: "Design" } as const;
const research = { key: "research", label: "Research" } as const;
const rows = [
  { id: "one", title: "One", url: "https://one.example", tags: [design] },
  { id: "two", title: "Two", url: "https://two.example", tags: [] },
  { id: "three", title: "Three", url: "https://three.example", tags: [research] },
] satisfies readonly BookmarkRow[];

describe("bulk organization", () => {
  it("retains exact-ID selection across views and prunes only deleted IDs", () => {
    const bulk = createBulkOrganization({ rows: () => rows, write: vi.fn(), commit: vi.fn(), onState: vi.fn() });
    bulk.enter();
    bulk.toggle("one");
    bulk.toggle("three");

    bulk.retain(["one", "two"]);

    expect(bulk.state().selectedIds).toEqual(["one"]);
    expect(bulk.state().mode).toBe(true);
  });

  it("adds canonical staged tags, skips no-op writes, and commits once", async () => {
    const write = vi.fn(async (_id: string, _tags: readonly TagRecord[]) => undefined);
    const commit = vi.fn();
    const bulk = createBulkOrganization({ rows: () => rows, write, commit, onState: vi.fn() });
    bulk.enter();
    bulk.toggle("one");
    bulk.toggle("two");
    bulk.stage(design);
    bulk.stage({ key: "research", label: "RESEARCH" });

    await bulk.apply("add");

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenNthCalledWith(1, "one", [design, research]);
    expect(write).toHaveBeenNthCalledWith(2, "two", [design, research]);
    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith({ one: [design, research], two: [design, research] });
    expect(bulk.state().selectedIds).toEqual([]);
  });

  it("removes only staged keys and skips rows with no matching assignment", async () => {
    const write = vi.fn(async (_id: string, _tags: readonly TagRecord[]) => undefined);
    const commit = vi.fn();
    const bulk = createBulkOrganization({ rows: () => rows, write, commit, onState: vi.fn() });
    bulk.enter();
    bulk.toggle("one");
    bulk.toggle("three");
    bulk.stage(design);

    await bulk.apply("remove");

    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith("one", []);
    expect(commit).toHaveBeenCalledWith({ one: [] });
    expect(bulk.state().selectedIds).toEqual([]);
  });

  it("commits fulfilled writes, retains failures, and retries only failed IDs", async () => {
    let release: (() => void) | undefined;
    let failTwo = true;
    const write = vi.fn(async (id: string) => {
      if (id === "one") await new Promise<void>((resolve) => { release = resolve; });
      if (id === "two" && failTwo) throw new TypeError("storage unavailable");
    });
    const commit = vi.fn();
    const bulk = createBulkOrganization({ rows: () => rows, write, commit, onState: vi.fn() });
    bulk.enter();
    bulk.toggle("one");
    bulk.toggle("two");
    bulk.stage(research);

    const first = bulk.apply("add");
    const overlapping = bulk.apply("add");
    expect(bulk.state().status).toBe("saving");
    release?.();
    await Promise.all([first, overlapping]);

    expect(write).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledWith({ one: [design, research] });
    expect(bulk.state()).toMatchObject({ status: "error", selectedIds: ["two"] });
    failTwo = false;
    await bulk.apply("add");
    expect(write).toHaveBeenCalledTimes(3);
    expect(bulk.state()).toMatchObject({ status: "success", selectedIds: [] });
  });
});
