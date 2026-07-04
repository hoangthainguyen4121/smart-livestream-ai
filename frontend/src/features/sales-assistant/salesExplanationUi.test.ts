import { describe, expect, it } from "vitest";

import { buildSalesNlpExplanation } from "../sales-nlp/salesNlpExplanation";
import type { SalesNlpExplanation } from "../sales-nlp/salesNlpTypes";
import { getExplanationWarningKey } from "./salesExplanationUi";

function greetingExplanation(): SalesNlpExplanation {
  return {
    comment: "chào buổi tối",
    normalizedText: "chao buoi toi",
    intent: "PURCHASE_INTENT",
    intentReason: 'PhoBERT mapped intent "PURCHASE_INTENT" with confidence 78%',
    regexIntent: "UNKNOWN",
    regexMatchedPatterns: [],
    intentSource: "ml",
    mlRawIntent: "PURCHASE_INTENT",
    confidence: 0.81,
    resolvedProductId: "glasses-a",
    resolvedProductName: "Kính thời trang A",
    contextSource: "clarification",
    contextReason: "No product context and no confident catalog match.",
    productCandidates: [],
    action: "ESCALATE_TO_HOST",
    actionReason: "ML override selected action ESCALATE_TO_HOST",
    reply: "Bạn muốn chốt sản phẩm nào ạ?",
    replyReason: "Clarification question because product context is ambiguous or missing",
    suppressEvent: false,
    isClarification: true,
  };
}

describe("salesExplanationUi", () => {
  it("warns when ML confidence is high but regex is silent on short greeting", () => {
    const explanation = greetingExplanation();
    expect(getExplanationWarningKey(explanation, 0.78)).toBe("explainWarningMlRegexDisagree");
  });

  it("does not warn when CHITCHAT suppresses the event", () => {
    const explanation: SalesNlpExplanation = {
      ...greetingExplanation(),
      intent: "UNKNOWN",
      mlRawIntent: "CHITCHAT",
      suppressEvent: true,
      action: "IGNORE",
    };
    expect(getExplanationWarningKey(explanation, 0.83)).toBeNull();
  });
});

describe("buildSalesNlpExplanation integration", () => {
  it("exports intent and action reasons for greeting misclassification shape", () => {
    const explanation = greetingExplanation();
    expect(explanation.regexIntent).toBe("UNKNOWN");
    expect(explanation.actionReason).toContain("ESCALATE_TO_HOST");
    expect(buildSalesNlpExplanation).toBeDefined();
  });
});
