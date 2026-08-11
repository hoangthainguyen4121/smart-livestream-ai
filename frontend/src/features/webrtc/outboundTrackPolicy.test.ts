import { describe, expect, it } from "vitest";

import { pickOutboundVideoTrack, resolveOutboundTrackMode } from "./outboundTrackPolicy";

function fakeTrack(readyState: MediaStreamTrackState = "live"): MediaStreamTrack {
  return { readyState, kind: "video" } as MediaStreamTrack;
}

describe("resolveOutboundTrackMode", () => {
  it("uses processed canvas while document is visible", () => {
    expect(resolveOutboundTrackMode("visible")).toBe("processed");
  });

  it("falls back to raw track when tab is hidden", () => {
    expect(resolveOutboundTrackMode("hidden")).toBe("raw");
  });
});

describe("pickOutboundVideoTrack", () => {
  it("prefers processed in processed mode", () => {
    const processed = fakeTrack();
    const raw = fakeTrack();
    expect(pickOutboundVideoTrack({ mode: "processed", processedTrack: processed, rawTrack: raw })).toBe(
      processed,
    );
  });

  it("prefers raw in raw mode", () => {
    const processed = fakeTrack();
    const raw = fakeTrack();
    expect(pickOutboundVideoTrack({ mode: "raw", processedTrack: processed, rawTrack: raw })).toBe(raw);
  });

  it("falls back when preferred track is ended", () => {
    const processed = fakeTrack("ended");
    const raw = fakeTrack("live");
    expect(pickOutboundVideoTrack({ mode: "processed", processedTrack: processed, rawTrack: raw })).toBe(
      raw,
    );
  });
});
