import { getApiBaseUrl } from "./config";
import type {
  IntentCorrectionResponse,
  IntentCorrectionSubmitPayload,
} from "../features/intent-correction/intentCorrectionTypes";

export class IntentCorrectionApiError extends Error {
  readonly code: string | null;
  readonly status: number;

  constructor(message: string, options?: { code?: string | null; status?: number }) {
    super(message);
    this.name = "IntentCorrectionApiError";
    this.code = options?.code ?? null;
    this.status = options?.status ?? 0;
  }
}

export async function submitIntentCorrection(
  payload: IntentCorrectionSubmitPayload,
): Promise<IntentCorrectionResponse> {
  const response = await fetch(`${getApiBaseUrl()}/api/intent-corrections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const raw = await response.text();
    const parsed = parseApiError(raw);
    throw new IntentCorrectionApiError(parsed.message, {
      code: parsed.code,
      status: response.status,
    });
  }

  return (await response.json()) as IntentCorrectionResponse;
}

function parseApiError(raw: string): { code: string | null; message: string } {
  if (!raw.trim()) {
    return { code: null, message: "Intent correction failed." };
  }

  try {
    const payload = JSON.parse(raw) as {
      detail?: string | { code?: string; message?: string };
      code?: string;
      message?: string;
    };

    if (typeof payload.detail === "string") {
      return { code: payload.code ?? null, message: payload.detail };
    }

    if (payload.detail && typeof payload.detail === "object") {
      return {
        code: payload.detail.code ?? payload.code ?? null,
        message: payload.detail.message ?? payload.message ?? raw,
      };
    }

    if (typeof payload.message === "string") {
      return { code: payload.code ?? null, message: payload.message };
    }
  } catch {
    // Keep raw text when body is not JSON.
  }

  return { code: null, message: raw };
}
