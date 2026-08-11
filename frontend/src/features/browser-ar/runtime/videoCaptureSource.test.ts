import { describe, expect, it } from "vitest";

import { resolveStreamDisplayStatus } from "./videoCaptureSource";

describe("resolveStreamDisplayStatus", () => {
  it("returns stopped when stream is not live", () => {
    expect(resolveStreamDisplayStatus(false, "camera")).toBe("stopped");
    expect(resolveStreamDisplayStatus(false, "screen")).toBe("stopped");
  });

  it("returns active source when stream is live", () => {
    expect(resolveStreamDisplayStatus(true, "camera")).toBe("camera");
    expect(resolveStreamDisplayStatus(true, "screen")).toBe("screen");
    expect(resolveStreamDisplayStatus(true, "file")).toBe("file");
  });
});
