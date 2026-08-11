import { getApiBaseUrl } from "./config";

export type WeaponStatusResponse = {
  enabled: boolean;
  ready: boolean;
  model_id: string;
  model_revision: string;
  loaded_model_id: string | null;
  loaded_revision: string | null;
  cache_dir: string | null;
  cache_dir_configured: boolean;
  architecture: string;
  license: string;
  prompt: string;
  normalized_labels: string[];
  stores_violation_images: boolean;
  auto_terminates_session: boolean;
  load_error: string | null;
  dependencies_installed: boolean;
  device: string;
};

export type WeaponDetectionDto = {
  label: string;
  score: number;
  box: number[];
};

export type WeaponDetectResponse = {
  detections: WeaponDetectionDto[];
  model_id: string;
  model_revision: string;
  inference_ms: number;
  prompt: string;
  stores_violation_images: boolean;
  auto_terminates_session: boolean;
};

/** Grounding DINO can be slow on CPU; allow longer than NSFW. */
const WEAPON_FETCH_TIMEOUT_MS = 30_000;

export async function fetchWeaponStatus(): Promise<WeaponStatusResponse | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/weapon/status`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as WeaponStatusResponse;
  } catch {
    return null;
  }
}

export async function detectWeaponFrame(
  imageBase64: string,
  clientTimestampMs?: number,
): Promise<WeaponDetectResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), WEAPON_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/weapon/detect-frame`, {
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
      throw new Error(detail || `weapon_detect_http_${response.status}`);
    }

    return (await response.json()) as WeaponDetectResponse;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function safeDetail(response: Response): Promise<string | null> {
  try {
    const payload = (await response.json()) as { detail?: string };
    return typeof payload.detail === "string" ? payload.detail : null;
  } catch {
    return null;
  }
}
