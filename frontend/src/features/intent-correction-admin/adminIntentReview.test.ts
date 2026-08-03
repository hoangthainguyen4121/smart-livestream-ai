import { describe, expect, it } from "vitest";

import {
  buildApprovePayload,
  buildRejectPayload,
  type IntentCorrectionListItem,
} from "../../api/adminIntentCorrections";
import { formatAdminListItemSummary } from "./formatAdminListItemSummary";

describe("admin intent correction payloads", () => {
  it("builds approve payload with final intent", () => {
    expect(buildApprovePayload("ask_price", "Confirmed")).toEqual({
      decision: "approved",
      final_intent: "ASK_PRICE",
      review_note: "Confirmed",
    });
  });

  it("builds reject payload without final intent", () => {
    expect(buildRejectPayload("Comment is ambiguous")).toEqual({
      decision: "rejected",
      review_note: "Comment is ambiguous",
    });
  });
});

describe("admin list item render summary", () => {
  it("formats pending row for admin list display", () => {
    const item: IntentCorrectionListItem = {
      id: "sample-1",
      source_comment_text: "gia bao nhieu",
      source_author_display_name: "guest",
      created_at: "2026-08-03T13:00:00Z",
      predicted_intent: "CHITCHAT",
      prediction_confidence: 0.62,
      model_id: "phobert_base",
      model_version: "phobert_base@2026-07-04",
      proposed_intent: "ASK_PRICE",
      user_note: null,
      status: "pending",
    };

    expect(formatAdminListItemSummary(item)).toBe(
      "guest: gia bao nhieu | CHITCHAT -> ASK_PRICE",
    );
  });
});
