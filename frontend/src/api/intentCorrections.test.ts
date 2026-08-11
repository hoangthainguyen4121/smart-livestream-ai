import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { submitIntentCorrection } from "./intentCorrections";

describe("submitIntentCorrection errors", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps feedback_database_disabled to a typed API error", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: {
            code: "feedback_database_disabled",
            message: "Intent correction storage requires DATABASE_URL.",
          },
        }),
        { status: 503 },
      ),
    );

    await expect(
      submitIntentCorrection({
        source_comment: {
          id: "c1",
          room_id: "demo",
          text: "ê",
          author_display_name: "guest",
          created_at: new Date().toISOString(),
        },
        prediction: {
          intent: "CHITCHAT",
          confidence: 0.88,
          model_id: "phobert_base_combined_hardcases_v2",
          model_version: "phobert_base_combined_hardcases_v2@2026-07-04",
        },
        proposed_intent: "ASK_LINK",
        reporter_viewer_key: "viewer-key-12345678",
        user_note: "sai",
      }),
    ).rejects.toMatchObject({
      name: "IntentCorrectionApiError",
      code: "feedback_database_disabled",
    });
  });
});
