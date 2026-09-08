import { describe, expect, it } from "vitest";

import { displayUrl } from "../../src/bookmarks/display-url.js";

describe("displayUrl", () => {
  it("removes the protocol and leading www while retaining a readable path", () => {
    const nativeUrl = "https://www.example.com/reference/design/system/components/buttons";
    const visibleUrl = displayUrl(nativeUrl);
    expect(visibleUrl).toBe("example.com/reference/design/system/…");
    expect(nativeUrl).toBe("https://www.example.com/reference/design/system/components/buttons");
  });

  it("uses deterministic text for nonstandard and malformed URLs", () => {
    const visibleUrls = [displayUrl("chrome://bookmarks/"), displayUrl("not a valid URL")];
    expect(visibleUrls).toEqual(["bookmarks", "not a valid URL"]);
  });
});
