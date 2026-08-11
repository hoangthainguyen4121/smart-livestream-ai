import { getApiBaseUrl } from "./config";

export type AdultState = "SAFE" | "SUGGESTIVE" | "EXPLICIT";

export type AdultStatusResponse = {
  enabled: boolean;
  ready: boolean;
  taxonomy: AdultState[];
  auto_terminates_session: boolean;
  stores_violation_images: boolean;
  suggestive_min_score: number;
  falconsai_min_nsfw: number;
  suggestive: {
    enabled: boolean;
    ready: boolean;
    model_id: string;
    labels: string[];
    license: string;
    load_error: string | null;
  };
  falconsai: {
    enabled: boolean;
    ready: boolean;
    model_id: string;
    labels: string[];
    license: string;
    load_error: string | null;
  };
};

export type AdultClassifyResponse = {
  state: AdultState;
  primary_signal: string;
  reason: string;
  suggestive_mapped: AdultState | null;
  falconsai_mapped: AdultState | null;
  suggestive: {
    label: string | null;
    score: number | null;
    scores: Record<string, number> | null;
    inference_ms: number | null;
    error: string | null;
    enabled: boolean;
  };
  falconsai: {
    label: string | null;
    nsfw_score: number | null;
    normal_score: number | null;
    is_nsfw: boolean;
    inference_ms: number | null;
    error: string | null;
    enabled: boolean;
  };
  auto_terminates_session: boolean;
  stores_violation_images: boolean;
};

const ADULT_FETCH_TIMEOUT_MS = 12_000;

export async function fetchAdultStatus(): Promise<AdultStatusResponse | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/adult/status`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as AdultStatusResponse;
  } catch {
    return null;
  }
}

export async function classifyAdultFrame(
  imageBase64: string,
  clientTimestampMs?: number,
): Promise<AdultClassifyResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), ADULT_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/adult/classify-frame`, {
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
      throw new Error(detail || `adult_classify_http_${response.status}`);
    }

    return (await response.json()) as AdultClassifyResponse;
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
