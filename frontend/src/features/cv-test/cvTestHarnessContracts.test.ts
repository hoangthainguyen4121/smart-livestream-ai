import { describe, expect, it, vi } from "vitest";

import { shouldRunProductDetection } from "../object-detector/productDetectionPolicy";
import { buildWouldTerminateEvent, formatSimulatedEvent } from "./cvTestModeration";
import { createVideoObjectUrl, revokeVideoObjectUrl } from "./videoObjectUrl";

describe("cv test harness contracts", () => {
  it("COCO policy accepts file frame source like camera", () => {
    expect(
      shouldRunProductDetection({ enabled: true, isLive: true, videoSource: "file" }),
    ).toBe(true);
    expect(
      shouldRunProductDetection({ enabled: true, isLive: true, videoSource: "camera" }),
    ).toBe(true);
    expect(
      shouldRunProductDetection({ enabled: true, isLive: true, videoSource: "screen" }),
    ).toBe(false);
  });

  it("simulated moderation only logs WOULD_TERMINATE (never ends a session)", () => {
    const event = buildWouldTerminateEvent({
      label: "scissors",
      confidence: 0.9,
      evidenceCount: 3,
      windowMs: 5000,
    });
    expect(event.code).toBe("WOULD_TERMINATE");
    expect(event.detail).toContain("sharp_object_detected");
    expect(formatSimulatedEvent(event)).toMatch(/^WOULD_TERMINATE:/);
    expect(JSON.stringify(event)).not.toMatch(/end.?session|reportModeration/i);
  });

  it("select video creates object URL and cleanup revokes it", () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:harness");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const file = new File(["x"], "clip.mp4", { type: "video/mp4" });
    const url = createVideoObjectUrl(file);
    expect(url).toBe("blob:harness");
    expect(createObjectURL).toHaveBeenCalledWith(file);
    revokeVideoObjectUrl(url);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:harness");
    vi.unstubAllGlobals();
  });
});
