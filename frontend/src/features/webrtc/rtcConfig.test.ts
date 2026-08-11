import { describe, expect, it } from "vitest";

import { getRtcConfiguration } from "./rtcConfig";

describe("getRtcConfiguration", () => {
  it("provides at least one STUN server for local/LAN ICE", () => {
    const config = getRtcConfiguration();
    expect(config.iceServers?.length).toBeGreaterThan(0);
    const urls = config.iceServers?.[0]?.urls;
    const list = Array.isArray(urls) ? urls : [urls];
    expect(list.some((url) => String(url).startsWith("stun:"))).toBe(true);
  });
});
