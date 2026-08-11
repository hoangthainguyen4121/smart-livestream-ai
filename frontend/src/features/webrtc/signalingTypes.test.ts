import { describe, expect, it } from "vitest";

import { isWebrtcSignalingMessage } from "./signalingTypes";

describe("isWebrtcSignalingMessage", () => {
  it("accepts known signaling types", () => {
    expect(
      isWebrtcSignalingMessage({
        type: "webrtc_offer",
        room_id: "r1",
        peer_id: "host",
        target_peer_id: "viewer",
        sdp: { type: "offer", sdp: "v=0" },
      }),
    ).toBe(true);
  });

  it("rejects chat messages", () => {
    expect(isWebrtcSignalingMessage({ type: "chat_message", text: "hi" })).toBe(false);
  });
});
