import { getApiBaseUrl } from "./config";
import type { WeaponDetectionDto, WeaponDetectResponse } from "./weaponDetector";

export type FirearmOnnxStatusResponse = {
  enabled: boolean;
  ready: boolean;
  detector: string;
  model_id: string;
  model_revision: string;
  architecture: string;
  license: string;
  classes: string[];
  imgsz: number;
  cache_dir: string | null;
  cache_dir_configured: boolean;
  onnx_path: string | null;
  onnx_exists: boolean;
  loaded_onnx_path: string | null;
  auto_terminates_session: boolean;
  stores_violation_images: boolean;
  load_error: string | null;
  dependencies_installed: boolean;
  runtime: string;
  ultralytics_runtime: boolean;
};

export type FirearmOnnxDetectResponse = WeaponDetectResponse & {
  detector: "firearm_onnx" | string;
  top_score?: number;
  conf_threshold?: number;
};

const FIREARM_FETCH_TIMEOUT_MS = 15_000;

export async function fetchFirearmOnnxStatus(): Promise<FirearmOnnxStatusResponse | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/weapon/firearm-onnx/status`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as FirearmOnnxStatusResponse;
  } catch {
    return null;
  }
}

export async function detectFirearmOnnxFrame(
  imageBase64: string,
  clientTimestampMs?: number,
): Promise<FirearmOnnxDetectResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), FIREARM_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/weapon/firearm-onnx/detect-frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64,
        clientTimestampMs,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await safeDetail(response);
      throw new Error(detail || `firearm_onnx_http_${response.status}`);
    }

    return (await response.json()) as FirearmOnnxDetectResponse;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function topFirearmHit(detections: WeaponDetectionDto[]): WeaponDetectionDto | null {
  if (!detections.length) {
    return null;
  }
  return [...detections].sort((a, b) => b.score - a.score)[0] ?? null;
}

async function safeDetail(response: Response): Promise<string | null> {
  try {
    const payload = (await response.json()) as { detail?: string };
    return typeof payload.detail === "string" ? payload.detail : null;
  } catch {
    return null;
  }
}
