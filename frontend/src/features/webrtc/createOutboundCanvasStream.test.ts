import { describe, expect, it, vi } from "vitest";

import { createOutboundCanvasStream, stopLocalMediaStream } from "./createOutboundCanvasStream";

describe("createOutboundCanvasStream", () => {
  it("returns null without canvas", () => {
    expect(createOutboundCanvasStream(null)).toBeNull();
  });

  it("captures canvas stream tracks", () => {
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = {
      getVideoTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
    const canvas = {
      captureStream: vi.fn(() => stream),
    } as unknown as HTMLCanvasElement;

    expect(createOutboundCanvasStream(canvas, 20)).toBe(stream);
    expect(canvas.captureStream).toHaveBeenCalledWith(20);
  });

  it("stops local tracks only", () => {
    const track = { stop: vi.fn() };
    stopLocalMediaStream({ getTracks: () => [track] } as unknown as MediaStream);
    expect(track.stop).toHaveBeenCalledTimes(1);
  });
});
