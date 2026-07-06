import { describe, expect, it } from "vitest";

import { getAllProducts } from "../product-catalog/productCatalogService";
import { classifyIntent } from "../sales-nlp/intentClassifier";
import { buildMlIntentBridge, mapMlIntentLabel } from "../sales-nlp/mlIntentBridge";
import { normalizeText } from "../sales-nlp/normalizeText";
import { translations } from "../../i18n/translations";
import { formatTranslation } from "../../i18n/translations";
import { processSalesComment } from "./processSalesComment";
import { resolveModelExplanation } from "./modelExplanationResolver";
import {
  buildDecisionTimeline,
  buildPredictionInterpretation,
  getClarificationQuestion,
  getDisplayResolvedProduct,
  getExplainableContextDisplayLabel,
  needsProductClarification,
} from "./salesExplainDisplay";
import type { MlIntentBridge } from "../sales-nlp/mlIntentBridge";

const catalog = getAllProducts();
const pinnedProduct = catalog.find((product) => product.id === "glasses-a")!;

const t = (key: keyof typeof translations.vi, params?: Record<string, string | number>) => {
  const template = translations.vi[key];
  return params ? formatTranslation(template, params) : template;
};

function mockMlBridge(mlIntent: string, confidence: number, comment: string): MlIntentBridge {
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

describe("salesExplainDisplay helpers", () => {
  it("maps explainable context sources to friendly Vietnamese labels", () => {
    expect(getExplainableContextDisplayLabel("explicit_catalog_match")).toBe(
      "Khớp trực tiếp với danh mục sản phẩm",
    );
    expect(getExplainableContextDisplayLabel("pinned_product")).toBe("Sản phẩm đang ghim");
    expect(getExplainableContextDisplayLabel("clarification")).toBe("Cần hỏi rõ sản phẩm");
    expect(getExplainableContextDisplayLabel("camera_vision")).toBe("Nhận diện camera thử nghiệm");
  });

  it("humanizes PhoBERT intent reason", () => {
    const { event } = processSalesComment({
      comment: "giá?",
      viewerAuthor: "Viewer",
      pinnedProduct,
      catalog,
      mlBridge: mockMlBridge("ASK_PRICE", 0.95, "giá?"),
    });
    expect(event).not.toBeNull();
    const sentence = buildPredictionInterpretation(
      event!.explanation,
      event!.mlConfidence,
      "vi",
      t,
    );
    expect(sentence).toContain("PhoBERT");
    expect(sentence).toContain("Hỏi giá");
    expect(sentence).not.toContain("PhoBERT mapped");
  });
});

describe("explainable AI validation cases", () => {
  it('handles "giá?" with pinned product and LIME token giá', () => {
    const { event } = processSalesComment({
      comment: "giá?",
      viewerAuthor: "Viewer",
      pinnedProduct,
      catalog,
      mlBridge: mockMlBridge("ASK_PRICE", 0.95, "giá?"),
    });

    expect(event).not.toBeNull();
    expect(event!.intent).toBe("ASK_PRICE");
    expect(event!.contextSource).toBe("pinned_product");
    expect(needsProductClarification(event!)).toBe(false);
    expect(getDisplayResolvedProduct(event!, t)).toBe("Kính thời trang A");
    expect(event!.modelExplanation?.predictedLabel).toBe("ASK_PRICE");
    expect(event!.modelExplanation?.positiveFeatures.some((f) => f.token === "giá")).toBe(true);

    const timeline = buildDecisionTimeline(event!, "vi", t);
    expect(timeline[2].detail).toContain("Sản phẩm đang ghim");
    expect(timeline[2].detail).toContain("Kính thời trang A");
  });

  it('handles "Son Ruby Đỏ giá?" with catalog match and LIME features', () => {
    const { event } = processSalesComment({
      comment: "Son Ruby Đỏ giá?",
      viewerAuthor: "Viewer",
      pinnedProduct,
      catalog,
      mlBridge: mockMlBridge("ASK_PRICE", 0.91, "Son Ruby Đỏ giá?"),
    });

    expect(event).not.toBeNull();
    expect(event!.intent).toBe("ASK_PRICE");
    expect(event!.contextSource).toBe("catalog_match");
    expect(getDisplayResolvedProduct(event!, t)).toBe("Son Ruby Đỏ");
    expect(event!.explanation.contextSource).toBe("explicit_catalog_match");

    const model = event!.modelExplanation!;
    expect(model.positiveFeatures.map((f) => f.token)).toEqual(
      expect.arrayContaining(["giá", "Son", "Ruby"]),
    );
    expect(model.negativeFeatures.some((f) => f.token === "Đỏ")).toBe(true);

    const timeline = buildDecisionTimeline(event!, "vi", t);
    expect(timeline[2].detail).toContain("Khớp trực tiếp với danh mục sản phẩm");
    expect(timeline[2].detail).toContain("Son Ruby Đỏ");
  });

  it('uses pinned product for bare purchase action "chốt"', () => {
    const { event } = processSalesComment({
      comment: "chốt",
      viewerAuthor: "Viewer",
      pinnedProduct,
      catalog,
      mlBridge: mockMlBridge("PURCHASE_INTENT", 0.91, "chốt"),
    });

    expect(event).not.toBeNull();
    expect(event!.intent).toBe("PURCHASE_INTENT");
    expect(event!.contextSource).toBe("pinned_product");
    expect(needsProductClarification(event!)).toBe(false);
    expect(getDisplayResolvedProduct(event!, t)).toBe("Kính thời trang A");
    expect(getClarificationQuestion(event!)).toBeNull();
    expect(event!.suggestedReply).toContain("KÍNH THỜI TRANG A");
    expect(event!.suggestedReply).not.toContain("chốt sản phẩm nào");
    expect(event!.suggestedReply).toContain("thanh toán");
    expect(event!.suggestedReply).not.toContain("checkout");

    const timeline = buildDecisionTimeline(event!, "vi", t);
    expect(timeline[2].detail).toContain("Sản phẩm đang ghim");
    expect(timeline[2].detail).toContain("Kính thời trang A");
  });

  it("shows LIME-unavailable message for unknown comments with ML bridge only", () => {
    const model = resolveModelExplanation({
      comment: "còn hàng không shop",
      normalizedText: "con hang khong shop",
      mlBridge: mockMlBridge("ASK_STOCK", 0.91, "còn hàng không shop"),
    });

    expect(model?.source).toBe("ml_bridge");
    expect(model?.positiveFeatures).toEqual([]);
    expect(model?.negativeFeatures).toEqual([]);
    expect(model?.topLabels.length).toBeGreaterThan(0);
    expect(t("explainLimeUnavailable")).toContain("Chưa có LIME token explanation");
  });
});
