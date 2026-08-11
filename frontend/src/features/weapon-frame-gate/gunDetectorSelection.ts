/** Resolve DemoPage gun backend: Subh775 ONNX → (optional) Custom YOLOX → DINO → unavailable.

MVP live path: Subh775 when VITE_FIREARM_ONNX_ENABLED. Custom YOLOX is research-only
(VITE_FIREARM_YOLOX_ENABLED / -EnableYoloxHarness); do not enable on DemoPage hot path.
When YOLOX UI is OFF, Subh775 failure falls through to Grounding DINO — not YOLOX.
*/

import type { FirearmOnnxStatusResponse } from "../../api/firearmOnnxDetector";
import type { FirearmYoloxStatusResponse } from "../../api/firearmYoloxDetector";
import type { GunDetectorBackend } from "./weaponFrameGatePolicy";

export const FIREARM_YOLOX_DEMO_INTERVAL_MS = 500; // 2 FPS
/** Corrected-GT frame-level best-F1; too low for clean bbox overlay — A/B only. */
export const FIREARM_YOLOX_DEMO_MIN_SCORE = 0.02;

export const FIREARM_ONNX_DEMO_INTERVAL_MS = 500; // 2 FPS
/** Calibrated local eval for Subh775 Firearm ONNX. */
export const FIREARM_ONNX_DEMO_MIN_SCORE = 0.65;

export type GunDetectorSelection = {
  backend: GunDetectorBackend | null;
  mode:
    | "firearm_onnx"
    | "yolox_fallback"
    | "firearm_yolox"
    | "dino_fallback"
    | "dino_primary"
    | "unavailable";
  labelKey:
    | "visualSafetyGunDetectorOnnx"
    | "visualSafetyGunDetectorYoloxFallback"
    | "visualSafetyGunDetectorYolox"
    | "visualSafetyGunDetectorDinoFallback"
    | "visualSafetyGunDetectorDino"
    | "visualSafetyGunDetectorUnavailable";
  inferenceIntervalMs: number | undefined;
  minScore: number | undefined;
};

function envFlagOn(
  env: Record<string, string | undefined>,
  key: string,
): boolean {
  const raw = (env[key] ?? "false").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function isFirearmYoloxUiEnabled(
  env: Record<string, string | undefined> = import.meta.env as Record<
    string,
    string | undefined
  >,
): boolean {
  return envFlagOn(env, "VITE_FIREARM_YOLOX_ENABLED");
}

export function isFirearmOnnxUiEnabled(
  env: Record<string, string | undefined> = import.meta.env as Record<
    string,
    string | undefined
  >,
): boolean {
  return envFlagOn(env, "VITE_FIREARM_ONNX_ENABLED");
}

export function isWeaponDinoUiEnabled(
  env: Record<string, string | undefined> = import.meta.env as Record<
    string,
    string | undefined
  >,
): boolean {
  return envFlagOn(env, "VITE_WEAPON_DETECTOR_ENABLED");
}

export function firearmYoloxIsUsable(
  status: Pick<
    FirearmYoloxStatusResponse,
    "enabled" | "onnx_exists" | "dependencies_installed"
  > | null,
): boolean {
  if (!status) {
    return false;
  }
  return Boolean(status.enabled && status.dependencies_installed && status.onnx_exists);
}

export function firearmOnnxIsUsable(
  status: Pick<
    FirearmOnnxStatusResponse,
    "enabled" | "onnx_exists" | "dependencies_installed"
  > | null,
): boolean {
  if (!status) {
    return false;
  }
  return Boolean(status.enabled && status.dependencies_installed && status.onnx_exists);
}

export function resolveGunDetectorSelection(options: {
  yoloxUiEnabled: boolean;
  yoloxStatus: Pick<
    FirearmYoloxStatusResponse,
    "enabled" | "onnx_exists" | "dependencies_installed"
  > | null;
  firearmUiEnabled: boolean;
  firearmStatus: Pick<
    FirearmOnnxStatusResponse,
    "enabled" | "onnx_exists" | "dependencies_installed"
  > | null;
  dinoUiEnabled: boolean;
  dinoBackendEnabled: boolean | null;
}): GunDetectorSelection {
  const dinoBackendOk =
    options.dinoUiEnabled &&
    (options.dinoBackendEnabled === null || options.dinoBackendEnabled === true);
  const localGunPathWanted = options.yoloxUiEnabled || options.firearmUiEnabled;

  // 1) Subh775 Firearm ONNX — live DemoPage primary (clean boxes @ 0.65)
  if (options.firearmUiEnabled && firearmOnnxIsUsable(options.firearmStatus)) {
    return {
      backend: "firearm_onnx",
      mode: "firearm_onnx",
      labelKey: "visualSafetyGunDetectorOnnx",
      inferenceIntervalMs: FIREARM_ONNX_DEMO_INTERVAL_MS,
      minScore: FIREARM_ONNX_DEMO_MIN_SCORE,
    };
  }

  // 2) Custom YOLOX — only if Subh775 unavailable (A/B still selectable manually)
  if (options.yoloxUiEnabled && firearmYoloxIsUsable(options.yoloxStatus)) {
    return {
      backend: "firearm_yolox",
      mode: localGunPathWanted ? "yolox_fallback" : "firearm_yolox",
      labelKey: localGunPathWanted
        ? "visualSafetyGunDetectorYoloxFallback"
        : "visualSafetyGunDetectorYolox",
      inferenceIntervalMs: FIREARM_YOLOX_DEMO_INTERVAL_MS,
      minScore: FIREARM_YOLOX_DEMO_MIN_SCORE,
    };
  }

  // 3) Grounding DINO
  if (dinoBackendOk) {
    if (localGunPathWanted) {
      return {
        backend: "grounding_dino",
        mode: "dino_fallback",
        labelKey: "visualSafetyGunDetectorDinoFallback",
        inferenceIntervalMs: undefined,
        minScore: undefined,
      };
    }
    return {
      backend: "grounding_dino",
      mode: "dino_primary",
      labelKey: "visualSafetyGunDetectorDino",
      inferenceIntervalMs: undefined,
      minScore: undefined,
    };
  }

  return {
    backend: null,
    mode: "unavailable",
    labelKey: "visualSafetyGunDetectorUnavailable",
    inferenceIntervalMs: undefined,
    minScore: undefined,
  };
}
