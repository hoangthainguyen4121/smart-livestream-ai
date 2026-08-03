import { getApiBaseUrl } from "./config";
import type {
  IntentCorrectionResponse,
  IntentCorrectionSubmitPayload,
} from "../features/intent-correction/intentCorrectionTypes";

export async function submitIntentCorrection(
  payload: IntentCorrectionSubmitPayload,
): Promise<IntentCorrectionResponse> {
  const response = await fetch(`${getApiBaseUrl()}/api/intent-corrections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Intent correction failed (${response.status})`);
  }

  return (await response.json()) as IntentCorrectionResponse;
}
