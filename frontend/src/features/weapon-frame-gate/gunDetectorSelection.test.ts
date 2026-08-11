import { describe, expect, it } from "vitest";

import {
  FIREARM_ONNX_DEMO_MIN_SCORE,
  FIREARM_YOLOX_DEMO_MIN_SCORE,
  firearmOnnxIsUsable,
  firearmYoloxIsUsable,
  isFirearmOnnxUiEnabled,
  isFirearmYoloxUiEnabled,
  resolveGunDetectorSelection,
} from "./gunDetectorSelection";

const yoloxOk = { enabled: true, onnx_exists: true, dependencies_installed: true };
const onnxOk = { enabled: true, onnx_exists: true, dependencies_installed: true };
const yoloxMissing = { enabled: true, onnx_exists: false, dependencies_installed: true };
const onnxMissing = { enabled: true, onnx_exists: false, dependencies_installed: true };

describe("gunDetectorSelection", () => {
  it("defaults YOLOX + Subh775 UI flags OFF (production-safe)", () => {
    expect(isFirearmYoloxUiEnabled({})).toBe(false);
    expect(isFirearmOnnxUiEnabled({})).toBe(false);
    expect(isFirearmYoloxUiEnabled({ VITE_FIREARM_YOLOX_ENABLED: "true" })).toBe(true);
    expect(isFirearmOnnxUiEnabled({ VITE_FIREARM_ONNX_ENABLED: "true" })).toBe(true);
  });

  it("selects Subh775 ONNX as DemoPage primary when usable", () => {
    const selection = resolveGunDetectorSelection({
      yoloxUiEnabled: true,
      yoloxStatus: yoloxOk,
      firearmUiEnabled: true,
      firearmStatus: onnxOk,
      dinoUiEnabled: true,
      dinoBackendEnabled: true,
    });
    expect(selection.mode).toBe("firearm_onnx");
    expect(selection.backend).toBe("firearm_onnx");
    expect(selection.inferenceIntervalMs).toBe(500);
    expect(selection.minScore).toBe(FIREARM_ONNX_DEMO_MIN_SCORE);
    expect(selection.minScore).toBe(0.65);
  });

  it("falls back to Custom YOLOX when Subh775 artifact missing and harness ON", () => {
    const selection = resolveGunDetectorSelection({
      yoloxUiEnabled: true,
      yoloxStatus: yoloxOk,
      firearmUiEnabled: true,
      firearmStatus: onnxMissing,
      dinoUiEnabled: true,
      dinoBackendEnabled: true,
    });
    expect(selection.mode).toBe("yolox_fallback");
    expect(selection.backend).toBe("firearm_yolox");
    expect(selection.minScore).toBe(FIREARM_YOLOX_DEMO_MIN_SCORE);
    expect(selection.minScore).toBe(0.02);
  });

  it("MVP path: YOLOX harness OFF → Subh775; if Subh775 missing skip YOLOX → DINO", () => {
    const primary = resolveGunDetectorSelection({
      yoloxUiEnabled: false,
      yoloxStatus: yoloxOk,
      firearmUiEnabled: true,
      firearmStatus: onnxOk,
      dinoUiEnabled: true,
      dinoBackendEnabled: true,
    });
    expect(primary.mode).toBe("firearm_onnx");
    expect(primary.backend).toBe("firearm_onnx");

    const fallback = resolveGunDetectorSelection({
      yoloxUiEnabled: false,
      yoloxStatus: yoloxOk,
      firearmUiEnabled: true,
      firearmStatus: onnxMissing,
      dinoUiEnabled: true,
      dinoBackendEnabled: true,
    });
    expect(fallback.mode).toBe("dino_fallback");
    expect(fallback.backend).toBe("grounding_dino");
  });

  it("falls back to DINO when ONNX + YOLOX unavailable", () => {
    const selection = resolveGunDetectorSelection({
      yoloxUiEnabled: true,
      yoloxStatus: yoloxMissing,
      firearmUiEnabled: true,
      firearmStatus: onnxMissing,
      dinoUiEnabled: true,
      dinoBackendEnabled: true,
    });
    expect(selection.mode).toBe("dino_fallback");
    expect(selection.backend).toBe("grounding_dino");
  });

  it("uses DINO primary when local firearm flags OFF (prod/default)", () => {
    const selection = resolveGunDetectorSelection({
      yoloxUiEnabled: false,
      yoloxStatus: yoloxOk,
      firearmUiEnabled: false,
      firearmStatus: onnxOk,
      dinoUiEnabled: true,
      dinoBackendEnabled: true,
    });
    expect(selection.mode).toBe("dino_primary");
    expect(selection.backend).toBe("grounding_dino");
  });

  it("reports unavailable when neither path works", () => {
    expect(
      resolveGunDetectorSelection({
        yoloxUiEnabled: true,
        yoloxStatus: { enabled: false, onnx_exists: false, dependencies_installed: false },
        firearmUiEnabled: true,
        firearmStatus: { enabled: false, onnx_exists: false, dependencies_installed: false },
        dinoUiEnabled: false,
        dinoBackendEnabled: false,
      }).mode,
    ).toBe("unavailable");
  });

  it("treats missing onnx as unusable for both backends", () => {
    expect(firearmYoloxIsUsable(yoloxMissing)).toBe(false);
    expect(firearmOnnxIsUsable(onnxMissing)).toBe(false);
  });
});
