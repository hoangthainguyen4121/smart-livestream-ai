import { getApiBaseUrl } from "./config";

export type IntentTopKItem = {
  intent: string;
  confidence: number;
};

export type PredictIntentApiResponse = {
  ml_available: boolean;
  intent: string | null;
  confidence: number;
  top_k: IntentTopKItem[];
  mapped_intent: string | null;
  mapped_action: string | null;
  suppress_event: boolean;
  is_complaint_escalation: boolean;
  is_spam_moderation: boolean;
  source: "ml" | "unavailable";
  error?: string | null;
};

export type NlpHealthApiResponse = {
  proxy_status: string;
  ml_service_status: string;
  ml_service_url: string;
  ml_service_detail?: string | null;
};

const ML_FETCH_TIMEOUT_MS = 2500;

export async function predictIntent(text: string): Promise<PredictIntentApiResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), ML_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/nlp/predict-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return unavailableResponse("proxy_error");
    }

    return (await response.json()) as PredictIntentApiResponse;
  } catch {
    return unavailableResponse("network_error");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function fetchNlpHealth(): Promise<NlpHealthApiResponse | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/nlp/health`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as NlpHealthApiResponse;
  } catch {
    return null;
  }
}

function unavailableResponse(error: string): PredictIntentApiResponse {
  return {
    ml_available: false,
    intent: null,
    confidence: 0,
    top_k: [],
    mapped_intent: null,
    mapped_action: null,
    suppress_event: false,
    is_complaint_escalation: false,
    is_spam_moderation: false,
    source: "unavailable",
    error,
  };
}
