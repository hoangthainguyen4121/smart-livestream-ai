import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createVideoObjectUrl,
  formatVideoClock,
  isAcceptedVideoFile,
  revokeVideoObjectUrl,
} from "./videoObjectUrl";

describe("videoObjectUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates an object URL from a File", () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:cv-test-1");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    const file = new File(["x"], "clip.mp4", { type: "video/mp4" });
    expect(createVideoObjectUrl(file)).toBe("blob:cv-test-1");
    expect(createObjectURL).toHaveBeenCalledWith(file);
  });

  it("revokes object URLs", () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(), revokeObjectURL });
    revokeVideoObjectUrl("blob:cv-test-2");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cv-test-2");
    revokeVideoObjectUrl(null);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("accepts video MIME and common extensions", () => {
    expect(isAcceptedVideoFile(new File([], "a.mp4", { type: "video/mp4" }))).toBe(true);
    expect(isAcceptedVideoFile(new File([], "a.webm", { type: "" }))).toBe(true);
    expect(isAcceptedVideoFile(new File([], "a.txt", { type: "text/plain" }))).toBe(false);
  });

  it("formats clock mm:ss", () => {
    expect(formatVideoClock(0)).toBe("00:00");
    expect(formatVideoClock(72)).toBe("01:12");
    expect(formatVideoClock(Number.NaN)).toBe("00:00");
  });
});
