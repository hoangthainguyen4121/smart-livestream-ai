import { getApiBaseUrl } from "./config";

export type IntentCorrectionListItem = {
  id: string;
  source_comment_text: string;
  source_author_display_name: string;
  created_at: string;
  predicted_intent: string;
  prediction_confidence: number;
  model_id: string;
  model_version: string;
  proposed_intent: string;
  user_note: string | null;
  status: string;
};

export type IntentCorrectionListResponse = {
  items: IntentCorrectionListItem[];
  next_cursor: string | null;
};

export type ReviewDecision = "approved" | "rejected";

export type ReviewIntentCorrectionPayload =
  | {
      decision: "approved";
      final_intent: string;
      review_note?: string;
    }
  | {
      decision: "rejected";
      review_note?: string;
    };

export type ReviewIntentCorrectionResponse = {
  id: string;
  status: string;
  final_intent: string | null;
  review_note: string | null;
  reviewed_at: string;
  reviewed_by: string | null;
};

function adminHeaders(apiKey: string, reviewer?: string): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Admin-Api-Key": apiKey,
  };
  if (reviewer?.trim()) {
    headers["X-Admin-Reviewer"] = reviewer.trim();
  }
  return headers;
}

export async function listPendingIntentCorrections(
  apiKey: string,
  options?: { limit?: number; cursor?: string | null },
): Promise<IntentCorrectionListResponse> {
  const params = new URLSearchParams({ status: "pending" });
  if (options?.limit) {
    params.set("limit", String(options.limit));
  }
  if (options?.cursor) {
    params.set("cursor", options.cursor);
  }

  const response = await fetch(`${getApiBaseUrl()}/api/admin/intent-corrections?${params}`, {
    headers: adminHeaders(apiKey),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `List intent corrections failed (${response.status})`);
  }

  return (await response.json()) as IntentCorrectionListResponse;
}

export async function reviewIntentCorrection(
  apiKey: string,
  sampleId: string,
  payload: ReviewIntentCorrectionPayload,
  reviewer?: string,
): Promise<ReviewIntentCorrectionResponse> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/admin/intent-corrections/${sampleId}/review`,
    {
      method: "POST",
      headers: adminHeaders(apiKey, reviewer),
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Review intent correction failed (${response.status})`);
  }

  return (await response.json()) as ReviewIntentCorrectionResponse;
}

export function buildApprovePayload(finalIntent: string, reviewNote?: string): ReviewIntentCorrectionPayload {
  return {
    decision: "approved",
    final_intent: finalIntent.trim().toUpperCase(),
    review_note: reviewNote?.trim() || undefined,
  };
}

export function buildRejectPayload(reviewNote?: string): ReviewIntentCorrectionPayload {
  return {
    decision: "rejected",
    review_note: reviewNote?.trim() || undefined,
  };
}
