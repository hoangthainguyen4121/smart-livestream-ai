import { describe, expect, it } from "vitest";

import { getAllProducts } from "../product-catalog/productCatalogService";
import { buildMlIntentBridge, mapMlIntentLabel } from "./mlIntentBridge";
import { classifyIntent } from "./intentClassifier";
import { normalizeText } from "./normalizeText";
import { runSalesNlpPipeline } from "./salesNlpPipeline";
import type { MlIntentBridge } from "./mlIntentBridge";

const catalog = getAllProducts();
const pinnedProduct = catalog.find((product) => product.id === "glasses-a")!;

function mockMlResponse(
  mlIntent: string,
  confidence: number,
  comment: string,
) {
  const normalizedComment = normalizeText(comment);
  const mapped = mapMlIntentLabel(mlIntent, normalizedComment);
  return {
    ml_available: true,
    intent: mlIntent,
    confidence,
    top_k: [{ intent: mlIntent, confidence }],
    mapped_intent: mapped.mappedIntent,
    mapped_action: mapped.mappedAction,
    suppress_event: mapped.suppressEvent,
    is_complaint_escalation: mapped.isComplaintEscalation,
    is_spam_moderation: mapped.isSpamModeration,
    source: "ml" as const,
  };
}

function mockMlBridge(
  mlIntent: string,
  confidence: number,
  comment: string,
): MlIntentBridge {
  const normalizedComment = normalizeText(comment);
  const regexClassification = classifyIntent(normalizedComment);
  return buildMlIntentBridge(
    mockMlResponse(mlIntent, confidence, comment),
    regexClassification,
    normalizedComment,
  );
}

describe("mlIntentBridge (confidence-only)", () => {
  it("uses ML when confidence meets threshold", () => {
    const bridge = mockMlBridge("COMPLAINT", 0.85, "lừa đảo à");
    expect(bridge.usedMl).toBe(true);
    expect(bridge.isComplaintEscalation).toBe(true);
  });

  it("maps ASK_VARIANT with màu gì to ASK_COLOR", () => {
    const mapped = mapMlIntentLabel("ASK_VARIANT", normalizeText("Kính thời trang A màu gì"));
    expect(mapped.mappedIntent).toBe("ASK_COLOR");
  });

  it("falls back to regex when ML confidence is low", () => {
    const bridge = mockMlBridge("PURCHASE_INTENT", 0.35, "son");
    expect(bridge.usedMl).toBe(false);
  });
});

describe("manual UI regression pipeline", () => {
  it('handles "son" as category clarification without purchase intent', () => {
    const result = runSalesNlpPipeline({
      comment: "son",
      catalog,
      pinnedProduct,
      mlBridge: mockMlBridge("PRODUCT_INFO", 0.82, "son"),
    });
    expect(result.contextSource).toBe("clarification");
    expect(result.suggestedReply).toContain("son");
  });

  it('prefers resolver category clarification over wrong PURCHASE ML for "son"', () => {
    const result = runSalesNlpPipeline({
      comment: "son",
      catalog,
      pinnedProduct,
      mlBridge: mockMlBridge("PURCHASE_INTENT", 0.83, "son"),
    });
    expect(result.contextSource).toBe("clarification");
    expect(result.suggestedReply).toContain("son");
    expect(result.suggestedReply).not.toContain("chốt sản phẩm nào");
  });

  it('handles "sản phẩm ghim" as pinned reference', () => {
    const result = runSalesNlpPipeline({
      comment: "sản phẩm ghim",
      catalog,
      pinnedProduct,
      mlBridge: mockMlBridge("PRODUCT_INFO", 0.8, "sản phẩm ghim"),
    });
    expect(result.contextSource).toBe("pinned_product");
    expect(result.suggestedReply).toContain("ghim");
  });

  it('handles "em này" as deictic clarification with pinned context', () => {
    const result = runSalesNlpPipeline({
      comment: "em này",
      catalog,
      pinnedProduct,
      mlBridge: mockMlBridge("PRODUCT_INFO", 0.78, "em này"),
    });
    expect(result.contextSource).toBe("pinned_product");
    expect(result.suggestedReply).toContain("Bạn muốn hỏi gì về");
  });

  it('handles "sp này" with deictic clarification', () => {
    const result = runSalesNlpPipeline({
      comment: "sp này",
      catalog,
      pinnedProduct,
      mlBridge: mockMlBridge("PRODUCT_INFO", 0.76, "sp này"),
    });
    expect(result.isComplaintEscalation).toBe(false);
    expect(result.suggestedReply).toContain("Bạn muốn hỏi gì về");
  });

  it('handles "có mấy loại áo" as category query via resolver', () => {
    const result = runSalesNlpPipeline({
      comment: "có mấy loại áo",
      catalog,
      pinnedProduct,
      mlBridge: mockMlBridge("PRODUCT_INFO", 0.84, "có mấy loại áo"),
    });
    expect(result.contextSource).toBe("clarification");
    expect(result.suggestedReply).toContain("áo");
  });

  it('lists glasses for "shop bán kính gì"', () => {
    const result = runSalesNlpPipeline({
      comment: "shop bán kính gì",
      catalog,
      pinnedProduct,
      mlBridge: mockMlBridge("PRODUCT_INFO", 0.86, "shop bán kính gì"),
    });
    expect(result.contextSource).toBe("clarification");
    expect(result.suggestedReply).toContain("Kính chống nắng Urban");
  });

  it('returns colors for "Kính thời trang A màu gì"', () => {
    const result = runSalesNlpPipeline({
      comment: "Kính thời trang A màu gì",
      catalog,
      pinnedProduct,
      mlBridge: mockMlBridge("ASK_VARIANT", 0.88, "Kính thời trang A màu gì"),
    });
    expect(result.intent).toBe("ASK_COLOR");
    expect(result.suggestedReply).toContain("Đen");
    expect(result.suggestedReply).toContain("Vàng");
  });

  it('escalates "lừa đảo à" when ML predicts COMPLAINT', () => {
    const result = runSalesNlpPipeline({
      comment: "lừa đảo à",
      catalog,
      pinnedProduct,
      mlBridge: mockMlBridge("COMPLAINT", 0.88, "lừa đảo à"),
    });
    expect(result.isComplaintEscalation).toBe(true);
    expect(result.action).toBe("ESCALATE_TO_HOST");
  });

  it('escalates "không giống hình" when ML predicts COMPLAINT', () => {
    const result = runSalesNlpPipeline({
      comment: "không giống hình",
      catalog,
      pinnedProduct,
      mlBridge: mockMlBridge("COMPLAINT", 0.9, "không giống hình"),
    });
    expect(result.isComplaintEscalation).toBe(true);
  });

  it('uses pinned product for ML color intent on token "color"', () => {
    const result = runSalesNlpPipeline({
      comment: "color",
      catalog,
      pinnedProduct,
      mlBridge: mockMlBridge("ASK_VARIANT", 0.88, "color"),
    });
    expect(result.intent).toBe("ASK_COLOR");
    expect(result.contextSource).toBe("pinned_product");
    expect(result.suggestedReply).toContain("Kính thời trang A");
  });

  it('uses pinned product for bare stock question "còn bao nhiêu cái"', () => {
    const result = runSalesNlpPipeline({
      comment: "còn bao nhiêu cái",
      catalog,
      pinnedProduct,
      mlBridge: mockMlBridge("ASK_STOCK", 0.98, "còn bao nhiêu cái"),
    });
    expect(result.intent).toBe("ASK_STOCK");
    expect(result.contextSource).toBe("pinned_product");
    expect(result.suggestedReply).toContain("Kính thời trang A");
    expect(result.suggestedReply).toContain("25");
  });

  it('uses pinned product for bare color question "màu gì ?"', () => {
    const result = runSalesNlpPipeline({
      comment: "màu gì ?",
      catalog,
      pinnedProduct,
      mlBridge: mockMlBridge("ASK_VARIANT", 0.64, "màu gì ?"),
    });
    expect(result.intent).toBe("ASK_COLOR");
    expect(result.contextSource).toBe("pinned_product");
    expect(result.suggestedReply).toContain("Kính thời trang A");
    expect(result.suggestedReply).toMatch(/Đen|Vàng/);
  });

  it('uses pinned product for bare link request "link"', () => {
    const result = runSalesNlpPipeline({
      comment: "link",
      catalog,
      pinnedProduct,
      mlBridge: mockMlBridge("ASK_LINK", 0.99, "link"),
    });
    expect(result.intent).toBe("ASK_LINK");
    expect(result.contextSource).toBe("pinned_product");
    expect(result.suggestedReply).toContain("/products/glasses-a");
  });

  it('asks which product to purchase for "chốt" when nothing is pinned', () => {
    const result = runSalesNlpPipeline({
      comment: "chốt",
      catalog,
      pinnedProduct: null,
      mlBridge: mockMlBridge("PURCHASE_INTENT", 0.91, "chốt"),
    });
    expect(result.intent).toBe("PURCHASE_INTENT");
    expect(result.contextSource).toBe("clarification");
    expect(result.suggestedReply).toContain("chốt sản phẩm nào");
    expect(result.resolvedProduct).toBeNull();
  });

  it('uses pinned product for bare purchase action "chốt"', () => {
    const result = runSalesNlpPipeline({
      comment: "chốt",
      catalog,
      pinnedProduct,
      mlBridge: mockMlBridge("PURCHASE_INTENT", 0.91, "chốt"),
    });
    expect(result.intent).toBe("PURCHASE_INTENT");
    expect(result.contextSource).toBe("pinned_product");
    expect(result.suggestedReply).toContain("KÍNH THỜI TRANG A");
    expect(result.suggestedReply).not.toContain("chốt sản phẩm nào");
    expect(result.suggestedReply).not.toContain("checkout");
  });

  it('uses purchase-specific confirmation for "lấy 1"', () => {
    const result = runSalesNlpPipeline({
      comment: "lấy 1",
      catalog,
      pinnedProduct,
      mlBridge: mockMlBridge("PURCHASE_INTENT", 0.9, "lấy 1"),
    });
    expect(result.intent).toBe("PURCHASE_INTENT");
    expect(result.contextSource).toBe("pinned_product");
    expect(result.suggestedReply).toContain("KÍNH THỜI TRANG A");
  });

  it('uses pinned product for bare purchase action "đặt 1"', () => {
    const result = runSalesNlpPipeline({
      comment: "đặt 1",
      catalog,
      pinnedProduct,
      mlBridge: mockMlBridge("PURCHASE_INTENT", 0.89, "đặt 1"),
    });
    expect(result.intent).toBe("PURCHASE_INTENT");
    expect(result.contextSource).toBe("pinned_product");
    expect(result.suggestedReply).toContain("KÍNH THỜI TRANG A");
    expect(result.suggestedReply).not.toContain("chốt sản phẩm nào");
    expect(result.suggestedReply).not.toContain("checkout");
  });
});
