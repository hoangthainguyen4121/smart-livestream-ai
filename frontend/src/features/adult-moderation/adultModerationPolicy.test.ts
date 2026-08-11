import { describe, expect, it } from "vitest";

import {
  appendAdultEvidence,
  evaluateAdultGate,
  isAdultModerationUiEnabled,
  pruneAdultEvidence,
} from "./adultModerationPolicy";

const cfg = { requiredHits: 2, explicitRequiredHits: 3 };

describe("adultModerationPolicy", () => {
  it("enables UI from adult or legacy NSFW flag", () => {
    expect(isAdultModerationUiEnabled({ VITE_ADULT_MODERATION_ENABLED: "true" })).toBe(true);
    expect(isAdultModerationUiEnabled({ VITE_NSFW_FRAME_GATE_ENABLED: "true" })).toBe(true);
    expect(isAdultModerationUiEnabled({})).toBe(false);
  });

  it("keeps SAFE until temporal confirmation", () => {
    let hits = appendAdultEvidence(
      [],
      { atMs: 1000, state: "SUGGESTIVE", score: 0.8, label: "sexy" },
      5000,
    );
    expect(evaluateAdultGate(hits, cfg).state).toBe("SAFE");
    hits = appendAdultEvidence(
      hits,
      { atMs: 1500, state: "SUGGESTIVE", score: 0.77, label: "sexy" },
      5000,
    );
    expect(evaluateAdultGate(hits, cfg).state).toBe("SUGGESTIVE");
  });

  it("requires stronger persistence for EXPLICIT than SUGGESTIVE", () => {
    let hits = appendAdultEvidence(
      [],
      { atMs: 1000, state: "EXPLICIT", score: 0.9, label: "porn" },
      5000,
    );
    hits = appendAdultEvidence(
      hits,
      { atMs: 1600, state: "EXPLICIT", score: 0.91, label: "hentai" },
      5000,
    );
    // 2 explicit hits → SUGGESTIVE (elevated) but not EXPLICIT yet
    expect(evaluateAdultGate(hits, cfg).state).toBe("SUGGESTIVE");
    hits = appendAdultEvidence(
      hits,
      { atMs: 2200, state: "EXPLICIT", score: 0.92, label: "porn" },
      5000,
    );
    expect(evaluateAdultGate(hits, cfg).state).toBe("EXPLICIT");
  });

  it("resets via prune after window / empty append", () => {
    const hits = appendAdultEvidence(
      [{ atMs: 0, state: "SUGGESTIVE", score: 0.9, label: "sexy" }],
      null,
      1000,
    );
    expect(pruneAdultEvidence(hits, 5000, 1000)).toEqual([]);
  });
});
