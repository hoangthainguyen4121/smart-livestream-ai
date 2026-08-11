/** A/B logging helpers for Grounding DINO vs Firearm ONNX on #/dev/cv-test. */

import type { GunDetectorBackend } from "../weapon-frame-gate/weaponFrameGatePolicy";

export type { GunDetectorBackend };

export type GunAbExpected =
  | "gun_present"
  | "no_gun"
  | "hard_neg_drill"
  | "hard_neg_banana"
  | "hard_neg_tool"
  | "benign_human";

export type GunAbExpectedSource = "preset_timestamp_match" | "manual_current_frame";

export type GunAbFramePreset = {
  id: string;
  label: string;
  expected: GunAbExpected;
  hint: string;
  /** If set, preset expected is valid only when video time is near this second. */
  seekSec?: number;
  /** Half-window (seconds) for seekSec match. Default 2.5s. */
  seekToleranceSec?: number;
};

export const GUN_AB_FRAME_PRESETS: GunAbFramePreset[] = [
  {
    id: "gun_015",
    label: "Gun video ~00:15 (handheld)",
    expected: "gun_present",
    hint: "Seek preset (~00:15) then Compare — or set Expected manually for current frame",
    seekSec: 15,
    seekToleranceSec: 2.5,
  },
  {
    id: "gun_044",
    label: "Gun video ~00:44 (rack)",
    expected: "gun_present",
    hint: "Seek preset (~00:44) then Compare",
    seekSec: 44,
    seekToleranceSec: 2.5,
  },
  {
    id: "breathless_0144_face",
    label: "Breathless ~01:44 (face hard-neg)",
    expected: "no_gun",
    hint: "Hard-neg: face/veil FP case — seek ~01:44 on Breathless",
    seekSec: 104,
    seekToleranceSec: 3,
  },
  {
    id: "drill",
    label: "Drill / tool FP",
    expected: "hard_neg_drill",
    hint: "Use a drill/tool still — set Expected manually (no seek binding)",
  },
  {
    id: "banana",
    label: "Banana",
    expected: "hard_neg_banana",
    hint: "Benign object — set Expected manually",
  },
  {
    id: "benign_human",
    label: "Benign human",
    expected: "benign_human",
    hint: "Person without firearm — set Expected manually or use Breathless face preset",
  },
  {
    id: "tool_like",
    label: "Tool-like negative",
    expected: "hard_neg_tool",
    hint: "Phone / wrench / other elongated tool — set Expected manually",
  },
];

export type GunAbDetectorCell = {
  detector: GunDetectorBackend;
  pred: "gun" | "miss";
  label: string | null;
  score: number | null;
  box: number[] | null;
  latencyMs: number | null;
  error: string | null;
};

export type GunAbRow = {
  atMs: number;
  frameId: string;
  frameLabel: string;
  expected: GunAbExpected;
  expectedSource: GunAbExpectedSource;
  videoId: string | null;
  videoTimeSec: number | null;
  /** Subh775 Firearm ONNX baseline (AGPL local reference). */
  firearmOnnx: GunAbDetectorCell;
  /** Custom YOLOX-Nano (Apache-2.0 fine-tune candidate). */
  firearmYolox: GunAbDetectorCell;
};

export function presetMatchesTimestamp(
  preset: Pick<GunAbFramePreset, "seekSec" | "seekToleranceSec">,
  videoTimeSec: number | null,
): boolean {
  if (preset.seekSec === undefined || videoTimeSec === null || !Number.isFinite(videoTimeSec)) {
    return false;
  }
  const tol = preset.seekToleranceSec ?? 2.5;
  return Math.abs(videoTimeSec - preset.seekSec) <= tol;
}

/**
 * Bind expected label to the CURRENT sample.
 * Preset expected is used only when seekSec matches current timestamp.
 * Otherwise require an explicit manual label for the current frame.
 */
export function resolveAbExpected(options: {
  preset: GunAbFramePreset;
  videoTimeSec: number | null;
  manualExpected: GunAbExpected | "";
}):
  | { ok: true; expected: GunAbExpected; expectedSource: GunAbExpectedSource }
  | { ok: false; error: string } {
  const { preset, videoTimeSec, manualExpected } = options;

  if (manualExpected) {
    return {
      ok: true,
      expected: manualExpected,
      expectedSource: "manual_current_frame",
    };
  }

  if (presetMatchesTimestamp(preset, videoTimeSec)) {
    return {
      ok: true,
      expected: preset.expected,
      expectedSource: "preset_timestamp_match",
    };
  }

  if (preset.seekSec !== undefined) {
    const clock = formatClock(preset.seekSec);
    const actual =
      videoTimeSec === null || !Number.isFinite(videoTimeSec)
        ? "unknown"
        : formatClock(videoTimeSec);
    return {
      ok: false,
      error: `Preset "${preset.label}" expected=${preset.expected} only valid near ${clock} (±${preset.seekToleranceSec ?? 2.5}s). Current=${actual}. Seek preset or set Expected for current frame.`,
    };
  }

  return {
    ok: false,
    error: `Preset "${preset.label}" has no seek binding. Set Expected for the current frame before Compare.`,
  };
}

export function formatAbScore(score: number | null): string {
  if (score === null || !Number.isFinite(score)) {
    return "—";
  }
  return score.toFixed(2);
}

export function formatAbLatency(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) {
    return "—";
  }
  return `${Math.round(ms)}ms`;
}

export function formatAbPred(cell: GunAbDetectorCell): string {
  if (cell.error) {
    return `ERR`;
  }
  if (cell.pred === "miss") {
    return "miss";
  }
  return `${cell.label ?? "gun"} ${formatAbScore(cell.score)}`;
}

function formatClock(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function summarizeAbDecision(rows: GunAbRow[]): {
  decision:
    | "KEEP BASELINE SUBH775"
    | "USE CUSTOM YOLOX"
    | "PRETRAINED FIREARM MODEL INSUFFICIENT → DATASET/FINE-TUNE REQUIRED"
    | "INCOMPLETE";
  reason: string;
} {
  if (rows.length < 2) {
    return {
      decision: "INCOMPLETE",
      reason: "Need ≥2 compared frames (include a positive and a hard negative).",
    };
  }

  const positives = rows.filter((row) => row.expected === "gun_present");
  const hardNegs = rows.filter(
    (row) =>
      row.expected.startsWith("hard_neg") ||
      row.expected === "benign_human" ||
      row.expected === "no_gun",
  );

  if (!positives.length || !hardNegs.length) {
    return {
      decision: "INCOMPLETE",
      reason: "Compare at least one gun_present and one negative/hard-neg frame.",
    };
  }

  const basePosHits = positives.filter((row) => row.firearmOnnx.pred === "gun").length;
  const yoloxPosHits = positives.filter((row) => row.firearmYolox.pred === "gun").length;
  const baseFp = hardNegs.filter((row) => row.firearmOnnx.pred === "gun").length;
  const yoloxFp = hardNegs.filter((row) => row.firearmYolox.pred === "gun").length;

  const baseLat = rows
    .map((row) => row.firearmOnnx.latencyMs)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const yoloxLat = rows
    .map((row) => row.firearmYolox.latencyMs)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const baseMedian =
    baseLat.length > 0 ? [...baseLat].sort((a, b) => a - b)[Math.floor(baseLat.length / 2)]! : null;
  const yoloxMedian =
    yoloxLat.length > 0
      ? [...yoloxLat].sort((a, b) => a - b)[Math.floor(yoloxLat.length / 2)]!
      : null;

  const yoloxBetterFp = yoloxFp < baseFp;
  const recallOk = yoloxPosHits >= Math.max(1, basePosHits - 1);
  const yoloxUsableRecall = yoloxPosHits >= Math.ceil(positives.length * 0.5);
  const latencyOk =
    yoloxMedian === null || baseMedian === null || yoloxMedian <= Math.max(1500, baseMedian * 2);

  if (yoloxBetterFp && recallOk && yoloxUsableRecall && latencyOk) {
    return {
      decision: "USE CUSTOM YOLOX",
      reason: `Custom YOLOX hard-neg FP ${yoloxFp} < Subh775 ${baseFp}; recall ${yoloxPosHits}/${positives.length} vs ${basePosHits}/${positives.length}. Harness advisory only — no production-switch.`,
    };
  }

  if (!yoloxUsableRecall || yoloxFp > baseFp) {
    return {
      decision: "PRETRAINED FIREARM MODEL INSUFFICIENT → DATASET/FINE-TUNE REQUIRED",
      reason: `YOLOX recall ${yoloxPosHits}/${positives.length}, FP ${yoloxFp}/${hardNegs.length} vs Subh775 FP ${baseFp} — keep baseline or continue fine-tune.`,
    };
  }

  return {
    decision: "KEEP BASELINE SUBH775",
    reason: `No decisive Custom YOLOX win vs Subh775 (recall ${yoloxPosHits}/${positives.length} vs ${basePosHits}/${positives.length}, FP ${yoloxFp} vs ${baseFp}).`,
  };
}
