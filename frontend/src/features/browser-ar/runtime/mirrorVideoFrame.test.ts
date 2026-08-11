import { describe, expect, it, vi } from "vitest";

import { drawVideoFrame } from "./mirrorVideoFrame";

describe("drawVideoFrame", () => {
  it("draws mirrored frames for camera preview", () => {
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const video = {} as HTMLVideoElement;

    drawVideoFrame(context, video, 640, 480, true);

    expect(context.save).toHaveBeenCalled();
    expect(context.scale).toHaveBeenCalledWith(-1, 1);
    expect(context.drawImage).toHaveBeenCalledWith(video, -640, 0, 640, 480);
    expect(context.restore).toHaveBeenCalled();
  });

  it("draws unmirrored frames for screen sharing", () => {
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const video = {} as HTMLVideoElement;

    drawVideoFrame(context, video, 640, 480, false);

    expect(context.save).not.toHaveBeenCalled();
    expect(context.scale).not.toHaveBeenCalled();
    expect(context.drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 480);
  });
});
