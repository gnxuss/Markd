import { describe, expect, it } from "vitest";

import { nextTheme, readTheme } from "../../src/theme-preference.js";

describe("theme preference", () => {
  it("restores only the supported persisted theme", () => {
    expect(readTheme({ getItem: () => "dark" })).toBe("dark");
    expect(readTheme({ getItem: () => "light" })).toBe("light");
    expect(readTheme({ getItem: () => "system" })).toBe("light");
    expect(readTheme({ getItem: () => null })).toBe("light");
  });

  it("switches between the two supported themes", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
  });
});
