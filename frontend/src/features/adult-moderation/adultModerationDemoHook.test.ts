import { describe, expect, it } from "vitest";

import { isAdultModerationUiEnabled, readAdultGateConfig } from "./adultModerationPolicy";

describe("adult moderation DemoPage/startup wiring", () => {
  it("reads Start-LocalDemo-style FE flags", () => {
    const env = {
      VITE_ADULT_MODERATION_ENABLED: "true",
      VITE_NSFW_FRAME_GATE_ENABLED: "true",
      VITE_ADULT_REQUIRED_HITS: "2",
      VITE_ADULT_WINDOW_MS: "5000",
      VITE_ADULT_INFERENCE_INTERVAL_MS: "1500",
    };
    expect(isAdultModerationUiEnabled(env)).toBe(true);
    const cfg = readAdultGateConfig(env);
    expect(cfg.requiredHits).toBe(2);
    expect(cfg.windowMs).toBe(5000);
    expect(cfg.inferenceIntervalMs).toBe(1500);
  });
});
