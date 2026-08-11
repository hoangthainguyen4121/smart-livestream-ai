import { getApiBaseUrl } from "./config";
import type { WeaponDetectionDto, WeaponDetectResponse } from "./weaponDetector";

export type FirearmYoloxStatusResponse = {
  enabled: boolean;
  ready: boolean;
  detector: string;
  model_id: string;
  architecture: string;
  license: string;
  onnx_exists: boolean;
  dependencies_installed: boolean;
  conf_threshold?: number;
  load_error: string | null;
  production_default?: boolean;
};

export type FirearmYoloxDetectResponse = WeaponDetectResponse & {
  detector: "firearm_yolox" | string;
  top_score?: number;
  conf_threshold?: number;
};

const TIMEOUT_MS = 15_000;

export async function fetchFirearmYoloxStatus(): Promise<FirearmYoloxStatusResponse | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/weapon/firearm-yolox/status`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as FirearmYoloxStatusResponse;
  } catch {
    return null;
  }
}

export async function detectFirearmYoloxFrame(
  imageBase64: string,
  clientTimestampMs?: number,
): Promise<FirearmYoloxDetectResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/weapon/firearm-yolox/detect-frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64, clientTimestampMs }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`firearm_yolox_http_${response.status}`);
    }
    return (await response.json()) as FirearmYoloxDetectResponse;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function topYoloxHit(detections: WeaponDetectionDto[]): WeaponDetectionDto | null {
  if (!detections.length) {
    return null;
  }
  return [...detections].sort((a, b) => b.score - a.score)[0] ?? null;
}
