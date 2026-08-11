import { describe, expect, it, vi } from "vitest";

import { acquireVideoStream } from "./acquireVideoStream";

describe("acquireVideoStream", () => {
  it("requests camera media with ideal capture dimensions", async () => {
    const cameraStream = { id: "camera-stream" } as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(cameraStream);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia, getDisplayMedia: vi.fn() },
    });

    await expect(acquireVideoStream("camera")).resolves.toBe(cameraStream);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    });
  });

  it("requests display media for screen sharing", async () => {
    const screenStream = { id: "screen-stream" } as MediaStream;
    const getDisplayMedia = vi.fn().mockResolvedValue(screenStream);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn(), getDisplayMedia },
    });

    await expect(acquireVideoStream("screen")).resolves.toBe(screenStream);
    expect(getDisplayMedia).toHaveBeenCalledWith({
      video: true,
      audio: false,
    });
  });

  it("rejects file source (canvas harness, not MediaStream)", async () => {
    await expect(acquireVideoStream("file")).rejects.toThrow(
      "video_source_file_is_not_a_mediastream",
    );
  });
});
