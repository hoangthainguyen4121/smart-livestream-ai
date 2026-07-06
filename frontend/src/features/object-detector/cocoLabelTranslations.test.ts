import { describe, expect, it } from "vitest";

import { translateCocoLabel } from "./cocoLabelTranslations";

describe("translateCocoLabel", () => {
  it("returns Vietnamese labels when locale is vi", () => {
    expect(translateCocoLabel("person", "vi")).toBe("Người");
    expect(translateCocoLabel("remote", "vi")).toBe("Điều khiển");
    expect(translateCocoLabel("cell phone", "vi")).toBe("Điện thoại");
  });

  it("keeps English labels when locale is en", () => {
    expect(translateCocoLabel("person", "en")).toBe("person");
    expect(translateCocoLabel("remote", "en")).toBe("remote");
  });

  it("falls back to original label when unknown", () => {
    expect(translateCocoLabel("unknown-widget", "vi")).toBe("unknown-widget");
  });
});
