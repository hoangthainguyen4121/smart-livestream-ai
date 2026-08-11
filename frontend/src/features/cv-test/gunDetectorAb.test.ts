import { describe, expect, it } from "vitest";

import {
  formatAbPred,
  GUN_AB_FRAME_PRESETS,
  presetMatchesTimestamp,
  resolveAbExpected,
  summarizeAbDecision,
  type GunAbRow,
} from "./gunDetectorAb";

function row(
  expected: GunAbRow["expected"],
  onnxPred: "gun" | "miss",
  yoloxPred: "gun" | "miss",
): GunAbRow {
  return {
    atMs: Date.now(),
    frameId: expected,
    frameLabel: expected,
    expected,
    expectedSource: "manual_current_frame",
    videoId: "test.mp4",
    videoTimeSec: 15,
    firearmOnnx: {
      detector: "firearm_onnx",
      pred: onnxPred,
      label: onnxPred === "gun" ? "gun" : null,
      score: onnxPred === "gun" ? 0.8 : 0.2,
      box: null,
      latencyMs: 60,
      error: null,
    },
    firearmYolox: {
      detector: "firearm_yolox",
      pred: yoloxPred,
      label: yoloxPred === "gun" ? "gun" : null,
      score: yoloxPred === "gun" ? 0.75 : 0.1,
      box: null,
      latencyMs: 80,
      error: null,
    },
  };
}

describe("gunDetectorAb ground-truth binding", () => {
  it("does not allow preset gun_present when timestamp is far from seekSec", () => {
    const preset = GUN_AB_FRAME_PRESETS.find((p) => p.id === "gun_015")!;
    expect(presetMatchesTimestamp(preset, 104)).toBe(false);
    const resolved = resolveAbExpected({
      preset,
      videoTimeSec: 104,
      manualExpected: "",
    });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.error).toMatch(/01:44|01:40|Current/i);
    }
  });

  it("allows preset expected only when timestamp matches seekSec", () => {
    const preset = GUN_AB_FRAME_PRESETS.find((p) => p.id === "gun_015")!;
    const resolved = resolveAbExpected({
      preset,
      videoTimeSec: 15.2,
      manualExpected: "",
    });
    expect(resolved).toEqual({
      ok: true,
      expected: "gun_present",
      expectedSource: "preset_timestamp_match",
    });
  });

  it("manual expected overrides mismatched preset (Breathless 01:44 → no_gun)", () => {
    const preset = GUN_AB_FRAME_PRESETS.find((p) => p.id === "gun_015")!;
    const resolved = resolveAbExpected({
      preset,
      videoTimeSec: 104,
      manualExpected: "no_gun",
    });
    expect(resolved).toEqual({
      ok: true,
      expected: "no_gun",
      expectedSource: "manual_current_frame",
    });
  });

  it("breathless face preset binds no_gun near 01:44", () => {
    const preset = GUN_AB_FRAME_PRESETS.find((p) => p.id === "breathless_0144_face")!;
    const resolved = resolveAbExpected({
      preset,
      videoTimeSec: 104,
      manualExpected: "",
    });
    expect(resolved).toEqual({
      ok: true,
      expected: "no_gun",
      expectedSource: "preset_timestamp_match",
    });
  });
});

describe("gunDetectorAb summary", () => {
  it("formats predictions", () => {
    expect(
      formatAbPred({
        detector: "firearm_onnx",
        pred: "gun",
        label: "gun",
        score: 0.84,
        box: null,
        latencyMs: 62,
        error: null,
      }),
    ).toContain("0.84");
  });

  it("needs positive and negative rows", () => {
    const summary = summarizeAbDecision([
      row("gun_present", "gun", "gun"),
      row("gun_present", "gun", "gun"),
    ]);
    expect(summary.decision).toBe("INCOMPLETE");
  });

  it("prefers custom YOLOX when hard-neg FP drops", () => {
    const summary = summarizeAbDecision([
      row("gun_present", "gun", "gun"),
      row("no_gun", "gun", "miss"),
    ]);
    expect(summary.decision).toBe("USE CUSTOM YOLOX");
  });

  it("keeps baseline when YOLOX still FPs", () => {
    const summary = summarizeAbDecision([
      row("gun_present", "gun", "miss"),
      row("no_gun", "miss", "gun"),
    ]);
    expect(summary.decision).toMatch(/INSUFFICIENT|KEEP BASELINE/);
  });
});
