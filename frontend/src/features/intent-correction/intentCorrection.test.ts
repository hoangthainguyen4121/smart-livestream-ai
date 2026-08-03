import { describe, expect, it } from "vitest";

import {
  buildCommentCorrectionContext,
  buildIntentCorrectionPayload,
} from "./buildCommentCorrectionContext";

describe("buildCommentCorrectionContext", () => {
  it("returns null when model metadata is missing", () => {
    const result = buildCommentCorrectionContext(
      {
        id: "msg-1",
        room_id: "demo",
        author: "guest",
        text: "gia bao nhieu",
        created_at: "2026-08-03T13:00:00Z",
      },
      {
        ml_available: true,
        intent: "CHITCHAT",
        confidence: 0.62,
        top_k: [],
        mapped_intent: "UNKNOWN",
        mapped_action: "IGNORE",
        suppress_event: true,
        is_complaint_escalation: false,
        is_spam_moderation: false,
        source: "ml",
      },
    );

    expect(result).toBeNull();
  });

  it("captures original prediction metadata", () => {
    const result = buildCommentCorrectionContext(
      {
        id: "msg-1",
        room_id: "demo",
        author: "guest",
        text: "gia bao nhieu",
        created_at: "2026-08-03T13:00:00Z",
      },
      {
        ml_available: true,
        intent: "CHITCHAT",
        confidence: 0.62,
        top_k: [],
        mapped_intent: "UNKNOWN",
        mapped_action: "IGNORE",
        suppress_event: true,
        is_complaint_escalation: false,
        is_spam_moderation: false,
        source: "ml",
        model_id: "phobert_base_combined_hardcases_v2",
        model_version: "phobert_base_combined_hardcases_v2@2026-07-04",
      },
    );

    expect(result).toMatchObject({
      predictedIntent: "CHITCHAT",
      modelId: "phobert_base_combined_hardcases_v2",
      modelVersion: "phobert_base_combined_hardcases_v2@2026-07-04",
    });
  });
});

describe("buildIntentCorrectionPayload", () => {
  it("preserves model metadata in submit payload", () => {
    const context = buildCommentCorrectionContext(
      {
        id: "msg-1",
        room_id: "demo",
        author: "guest",
        text: "gia bao nhieu",
        created_at: "2026-08-03T13:00:00Z",
      },
      {
        ml_available: true,
        intent: "CHITCHAT",
        confidence: 0.62,
        top_k: [],
        mapped_intent: "UNKNOWN",
        mapped_action: "IGNORE",
        suppress_event: true,
        is_complaint_escalation: false,
        is_spam_moderation: false,
        source: "ml",
        model_id: "phobert_base_combined_hardcases_v2",
        model_version: "phobert_base_combined_hardcases_v2@2026-07-04",
      },
    );

    expect(context).not.toBeNull();
    const payload = buildIntentCorrectionPayload(context!, "ASK_PRICE", "viewer-1");
    expect(payload.prediction.model_id).toBe("phobert_base_combined_hardcases_v2");
    expect(payload.prediction.model_version).toBe(
      "phobert_base_combined_hardcases_v2@2026-07-04",
    );
    expect(payload.proposed_intent).toBe("ASK_PRICE");
  });
});
