import { describe, expect, it } from "vitest";
import { getAllProducts } from "../product-catalog";
import { classifyIntent } from "./intentClassifier";
import { buildMlIntentBridge, mapMlIntentLabel } from "./mlIntentBridge";
import { normalizeText } from "./normalizeText";
import { runSalesNlpPipeline } from "./salesNlpPipeline";
import type { SalesNlpIntent } from "./salesNlpTypes";

type EvalRow = {
  comment: string;
  mlIntent: string;
  mlConfidence: number;
  expectedIntent: SalesNlpIntent;
  expectCatalogMatch: boolean;
  expectComplaintEscalation?: boolean;
  label: string;
};

function bridgeFromMl(comment: string, mlIntent: string, confidence: number) {
  const normalizedComment = normalizeText(comment);
  const mapped = mapMlIntentLabel(mlIntent, normalizedComment);
  return buildMlIntentBridge(
    {
      ml_available: true,
      intent: mlIntent,
      confidence,
      top_k: [{ intent: mlIntent, confidence }],
      mapped_intent: mapped.mappedIntent,
      mapped_action: mapped.mappedAction,
      suppress_event: mapped.suppressEvent,
      is_complaint_escalation: mapped.isComplaintEscalation,
      is_spam_moderation: mapped.isSpamModeration,
      source: "ml",
    },
    classifyIntent(normalizedComment),
    normalizedComment,
  );
}

const EVAL_ROWS: EvalRow[] = [
  {
    comment: "Kính chống nắng Urban",
    mlIntent: "PURCHASE_INTENT",
    mlConfidence: 0.75,
    expectedIntent: "ASK_PRODUCT_INFO",
    expectCatalogMatch: true,
    label: "catalog_name_purchase_override",
  },
  {
    comment: "Son Ruby Đỏ",
    mlIntent: "COMPLAINT",
    mlConfidence: 0.55,
    expectedIntent: "ASK_PRODUCT_INFO",
    expectCatalogMatch: true,
    label: "catalog_name_complaint_override",
  },
  {
    comment: "Tai nghe Bluetooth Mini",
    mlIntent: "PURCHASE_INTENT",
    mlConfidence: 0.72,
    expectedIntent: "ASK_PRODUCT_INFO",
    expectCatalogMatch: true,
    label: "catalog_name_purchase_override",
  },
  {
    comment: "Kem chống nắng SPF50",
    mlIntent: "PURCHASE_INTENT",
    mlConfidence: 0.67,
    expectedIntent: "ASK_PRODUCT_INFO",
    expectCatalogMatch: true,
    label: "catalog_name_purchase_override",
  },
  {
    comment: "chốt Tai nghe Bluetooth Mini",
    mlIntent: "PURCHASE_INTENT",
    mlConfidence: 0.9,
    expectedIntent: "PURCHASE_INTENT",
    expectCatalogMatch: true,
    label: "contrast_purchase_verb",
  },
  {
    comment: "Son Ruby Đỏ giá bao nhiêu",
    mlIntent: "ASK_PRICE",
    mlConfidence: 0.88,
    expectedIntent: "ASK_PRICE",
    expectCatalogMatch: true,
    label: "contrast_price_question",
  },
  {
    comment: "shop giao sai Son Ruby Đỏ",
    mlIntent: "COMPLAINT",
    mlConfidence: 0.8,
    expectedIntent: "ASK_PRODUCT_INFO",
    expectCatalogMatch: true,
    expectComplaintEscalation: true,
    label: "contrast_complaint_signal",
  },
];

describe("productMentionIntentGuardrail pipeline eval", () => {
  const catalog = getAllProducts();
  const pinned = catalog[0];

  for (const row of EVAL_ROWS) {
    it(`${row.label}: ${row.comment}`, () => {
      const result = runSalesNlpPipeline({
        comment: row.comment,
        pinnedProduct: pinned,
        catalog,
        mlBridge: bridgeFromMl(row.comment, row.mlIntent, row.mlConfidence),
      });

      if (row.expectCatalogMatch) {
        expect(result.contextSource).toBe("catalog_match");
      }
      expect(result.intent).toBe(row.expectedIntent);
      if (row.expectComplaintEscalation) {
        expect(result.isComplaintEscalation).toBe(true);
      } else if (row.expectedIntent === "ASK_PRODUCT_INFO") {
        expect(result.isComplaintEscalation).toBe(false);
        expect(result.action).not.toBe("ESCALATE_TO_HOST");
      }
    });
  }
});
