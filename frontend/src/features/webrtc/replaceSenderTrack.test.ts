import { describe, expect, it, vi } from "vitest";

import { replaceVideoSenderTrack } from "./replaceSenderTrack";

describe("replaceVideoSenderTrack", () => {
  it("calls replaceTrack on the existing video sender", async () => {
    const next = { kind: "video", id: "next" } as MediaStreamTrack;
    const replaceTrack = vi.fn(async () => undefined);
    const sender = {
      track: { kind: "video", id: "old" } as MediaStreamTrack,
      replaceTrack,
    };
    const pc = {
      getSenders: () => [sender],
      getTransceivers: () => [],
    } as unknown as RTCPeerConnection;

    await expect(replaceVideoSenderTrack(pc, next)).resolves.toBe(true);
    expect(replaceTrack).toHaveBeenCalledWith(next);
  });

  it("does not recreate peers when track is unchanged", async () => {
    const track = { kind: "video", id: "same" } as MediaStreamTrack;
    const replaceTrack = vi.fn(async () => undefined);
    const sender = { track, replaceTrack };
    const pc = {
      getSenders: () => [sender],
      getTransceivers: () => [],
    } as unknown as RTCPeerConnection;

    await expect(replaceVideoSenderTrack(pc, track)).resolves.toBe(false);
    expect(replaceTrack).not.toHaveBeenCalled();
  });
});
