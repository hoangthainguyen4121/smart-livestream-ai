import { describe, expect, it } from "vitest";

import {
  appendNsfwEvidence,
  evaluateNsfwGate,
  isNsfwFrameGateUiEnabled,
  pruneNsfwEvidence,
  readNsfwGateConfig,
} from "./nsfwFrameGatePolicy";

describe("nsfwFrameGatePolicy", () => {
  it("reads config with defaults and clamps", () => {
    const config = readNsfwGateConfig({});
    expect(config.minScore).toBe(0.7);
    expect(config.requiredHits).toBe(2);
    expect(config.windowMs).toBe(5000);
  });

  it("enables UI only for truthy VITE flag", () => {
    expect(isNsfwFrameGateUiEnabled({})).toBe(false);
    expect(isNsfwFrameGateUiEnabled({ VITE_NSFW_FRAME_GATE_ENABLED: "true" })).toBe(true);
  });

  it("builds temporal warning without terminate action", () => {
    const windowMs = 5000;
    let hits = appendNsfwEvidence([], { atMs: 1000, nsfwScore: 0.91, label: "nsfw" }, windowMs);
    expect(evaluateNsfwGate(hits, { requiredHits: 2, minScore: 0.7 }).action).toBe("none");

    hits = appendNsfwEvidence(hits, { atMs: 1500, nsfwScore: 0.88, label: "nsfw" }, windowMs);
    const result = evaluateNsfwGate(hits, { requiredHits: 2, minScore: 0.7 });
    expect(result.action).toBe("warning");
    expect(result.evidenceCount).toBe(2);
  });

  it("prunes expired evidence", () => {
    const hits = pruneNsfwEvidence(
      [
        { atMs: 0, nsfwScore: 0.9, label: "nsfw" },
        { atMs: 4000, nsfwScore: 0.85, label: "nsfw" },
      ],
      6000,
      5000,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].atMs).toBe(4000);
  });
});
