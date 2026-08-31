import { describe, expect, it } from "vitest";

import {
  VISUAL_VIOLATION_DWELL_MS,
  VISUAL_VIOLATION_STRIKE_LIMIT,
  applyVisualViolationChannels,
  createVisualViolationStrikeState,
  isAdultViolationActive,
  isGunViolationActive,
  isSharpViolationActive,
} from "./visualViolationStrikes";

describe("visualViolationStrikes", () => {
  it("detects active violation channels", () => {
    expect(isAdultViolationActive("SAFE")).toBe(false);
    expect(isAdultViolationActive("SUGGESTIVE")).toBe(true);
    expect(isAdultViolationActive("EXPLICIT")).toBe(true);
    expect(isGunViolationActive("safe")).toBe(false);
    expect(isGunViolationActive("warning")).toBe(true);
    expect(isGunViolationActive("confirmed_risk")).toBe(true);
    expect(isSharpViolationActive("none")).toBe(false);
    expect(isSharpViolationActive("warning")).toBe(true);
  });

  it("counts rising edges once while held under dwell window", () => {
    let state = createVisualViolationStrikeState();
    state = applyVisualViolationChannels(
      state,
      { adult: true, gun: false, sharp: false },
      1_000,
    );
    expect(state.count).toBe(1);

    state = applyVisualViolationChannels(
      state,
      { adult: true, gun: false, sharp: false },
      1_000 + VISUAL_VIOLATION_DWELL_MS - 1,
    );
    expect(state.count).toBe(1);

    state = applyVisualViolationChannels(
      state,
      { adult: false, gun: false, sharp: false },
      5_000,
    );
    state = applyVisualViolationChannels(
      state,
      { adult: true, gun: true, sharp: false },
      5_100,
    );
    expect(state.count).toBe(3);
  });

  it("does not add dwell ticks while stale warning state stays visible", () => {
    let state = createVisualViolationStrikeState();
    state = applyVisualViolationChannels(
      state,
      { adult: true, gun: false, sharp: false },
      0,
      { evidenceCounts: { adult: 1, gun: 0, sharp: 0 } },
    );
    expect(state.count).toBe(1);

    state = applyVisualViolationChannels(
      state,
      { adult: true, gun: false, sharp: false },
      VISUAL_VIOLATION_DWELL_MS,
      { evidenceCounts: { adult: 1, gun: 0, sharp: 0 } },
    );
    expect(state.count).toBe(1);

    state = applyVisualViolationChannels(
      state,
      { adult: true, gun: false, sharp: false },
      VISUAL_VIOLATION_DWELL_MS * 3,
      { evidenceCounts: { adult: 1, gun: 0, sharp: 0 } },
    );
    expect(state.count).toBe(1);
  });

  it("counts each new evidence hit while violation persists", () => {
    let state = createVisualViolationStrikeState();
    state = applyVisualViolationChannels(
      state,
      { adult: false, gun: true, sharp: false },
      0,
      { evidenceCounts: { adult: 0, gun: 1, sharp: 0 } },
    );
    expect(state.count).toBe(1);

    state = applyVisualViolationChannels(
      state,
      { adult: false, gun: true, sharp: false },
      VISUAL_VIOLATION_DWELL_MS,
      { evidenceCounts: { adult: 0, gun: 2, sharp: 0 } },
    );
    expect(state.count).toBe(2);

    state = applyVisualViolationChannels(
      state,
      { adult: false, gun: true, sharp: false },
      VISUAL_VIOLATION_DWELL_MS * 2,
      { evidenceCounts: { adult: 0, gun: 2, sharp: 0 } },
    );
    expect(state.count).toBe(2);
  });

  it("marks limit reached at threshold", () => {
    let state = createVisualViolationStrikeState();
    let now = 0;
    for (let i = 0; i < VISUAL_VIOLATION_STRIKE_LIMIT; i += 1) {
      state = applyVisualViolationChannels(
        state,
        { adult: false, gun: false, sharp: false },
        now,
      );
      now += 10;
      state = applyVisualViolationChannels(
        state,
        { adult: true, gun: false, sharp: false },
        now,
        { evidenceCounts: { adult: i + 1, gun: 0, sharp: 0 } },
      );
      now += VISUAL_VIOLATION_DWELL_MS + 10;
    }
    expect(state.count).toBe(VISUAL_VIOLATION_STRIKE_LIMIT);
    expect(state.limitReached).toBe(true);

    const held = applyVisualViolationChannels(
      state,
      { adult: false, gun: true, sharp: false },
      now,
    );
    expect(held.count).toBe(VISUAL_VIOLATION_STRIKE_LIMIT);
    expect(held.limitReached).toBe(true);
  });
});
