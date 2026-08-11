import { getApiBaseUrl } from "./config";

export type NsfwStatusResponse = {
  enabled: boolean;
  ready: boolean;
  model_id: string;
  model_revision: string;
  loaded_model_id: string | null;
  loaded_revision: string | null;
  cache_dir: string | null;
  cache_dir_configured: boolean;
  architecture: string;
  labels: string[];
  license: string;
  trust_remote_code: boolean;
  stores_violation_images: boolean;
  auto_terminates_session: boolean;
  load_error: string | null;
  dependencies_installed: boolean;
};

export type NsfwClassifyResponse = {
  label: "normal" | "nsfw" | string;
  nsfw_score: number;
  normal_score: number;
  is_nsfw: boolean;
  model_id: string;
  model_revision: string;
  inference_ms: number;
  stores_violation_images: boolean;
  auto_terminates_session: boolean;
};

const NSFW_FETCH_TIMEOUT_MS = 8_000;

export async function fetchNsfwStatus(): Promise<NsfwStatusResponse | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/nsfw/status`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as NsfwStatusResponse;
  } catch {
    return null;
  }
}

export async function classifyNsfwFrame(
  imageBase64: string,
  clientTimestampMs?: number,
): Promise<NsfwClassifyResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), NSFW_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/nsfw/classify-frame`, {
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
      throw new Error(detail || `nsfw_classify_http_${response.status}`);
    }

    return (await response.json()) as NsfwClassifyResponse;
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
