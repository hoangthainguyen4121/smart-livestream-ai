import { afterEach, describe, expect, it, vi } from "vitest";

import { createVideoCanvasFrameSource } from "./videoCanvasFrameSource";

function fakeCanvas(): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(),
  } as unknown as HTMLCanvasElement;
}

function fakeVideo(readyState = 2): HTMLVideoElement {
  return { readyState } as unknown as HTMLVideoElement;
}

describe("createVideoCanvasFrameSource", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes getCanvasElement matching the paint target", () => {
    const canvas = fakeCanvas();
    const source = createVideoCanvasFrameSource(canvas, { width: 320, height: 240 });
    expect(source.getCanvasElement()).toBe(canvas);
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(240);
    source.stop();
  });

  it("paints when video has data", () => {
    const requestAnimationFrame = vi.fn(() => 1);
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("window", { requestAnimationFrame, cancelAnimationFrame });

    const canvas = fakeCanvas();
    const drawImage = vi.fn();
    (canvas.getContext as ReturnType<typeof vi.fn>).mockReturnValue({
      drawImage,
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
    });

    const source = createVideoCanvasFrameSource(canvas, { width: 64, height: 48 });
    expect(source.paintOnce()).toBe(false);
    source.start(fakeVideo(2));
    expect(source.paintOnce()).toBe(true);
    expect(drawImage).toHaveBeenCalled();
    source.stop();
  });

  it("stop cancels the paint loop", () => {
    const cancelAnimationFrame = vi.fn();
    const requestAnimationFrame = vi.fn(() => 42);
    vi.stubGlobal("window", { requestAnimationFrame, cancelAnimationFrame });

    const canvas = fakeCanvas();
    const source = createVideoCanvasFrameSource(canvas, { width: 64, height: 48 });
    source.start(fakeVideo());
    expect(requestAnimationFrame).toHaveBeenCalled();
    source.stop();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
  });
});
