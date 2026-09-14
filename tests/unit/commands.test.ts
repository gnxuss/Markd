import { describe, expect, it, vi } from "vitest";

import { dispatchExtensionCommand } from "../../src/commands.js";

describe("extension commands", () => {
  it("opens one focused library for the custom command and ignores unknown names", () => {
    // Given: a narrow packaged-library adapter.
    const openLibrary = vi.fn();

    // When: Chromium dispatches the custom command and an unrelated name.
    const handled = dispatchExtensionCommand("open-library", openLibrary);
    const ignored = dispatchExtensionCommand("unknown", openLibrary);

    // Then: exactly one focused library open is requested.
    expect(handled).toBe(true);
    expect(ignored).toBe(false);
    expect(openLibrary).toHaveBeenCalledTimes(1);
  });
});
