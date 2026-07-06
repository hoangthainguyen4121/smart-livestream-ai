import { describe, expect, it } from "vitest";

import { getAllProducts } from "../product-catalog/productCatalogService";
import { classifyIntent } from "./intentClassifier";
import { buildMlIntentBridge, mapMlIntentLabel } from "./mlIntentBridge";
import { normalizeText } from "./normalizeText";
import { resolveProductContext } from "./productContextResolver";
import { runSalesNlpPipeline } from "./salesNlpPipeline";
import type { MlIntentBridge } from "./mlIntentBridge";

const catalog = getAllProducts();
const glassesA = catalog.find((product) => product.id === "glasses-a")!;
const lipstickRuby = catalog.find((product) => product.id === "lipstick-ruby")!;

function mockMlResponse(mlIntent: string, confidence: number, comment: string) {
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

function mockMlBridge(mlIntent: string, confidence: number, comment: string): MlIntentBridge {
  const normalizedComment = normalizeText(comment);
  return buildMlIntentBridge(
    mockMlResponse(mlIntent, confidence, comment),
    classifyIntent(normalizedComment),
    normalizedComment,
  );
}

describe("ML intent vs product context separation", () => {
  it("uses ML ASK_PRICE intent with resolver-chosen product", () => {
    const result = runSalesNlpPipeline({
      comment: "cái này giá?",
      catalog,
      pinnedProduct: glassesA,
      mlBridge: mockMlBridge("ASK_PRICE", 0.92, "cái này giá?"),
    });
    expect(result.intent).toBe("ASK_PRICE");
    expect(result.intentSource).toBe("ml");
    expect(result.contextSource).toBe("pinned_product");
    expect(result.suggestedReply).toContain(glassesA.name);
    expect(result.suggestedReply).toContain("giá");
  });

  it("uses ML PRODUCT_INFO for category listing; resolver lists products", () => {
    const result = runSalesNlpPipeline({
      comment: "shop bán kính gì",
      catalog,
      pinnedProduct: glassesA,
      mlBridge: mockMlBridge("PRODUCT_INFO", 0.9, "shop bán kính gì"),
    });
    expect(result.intent).toBe("ASK_PRODUCT_INFO");
    expect(result.contextSource).toBe("clarification");
    expect(result.suggestedReply).toContain("Kính");
    expect(result.suggestedReply).not.toContain("299.000");
  });

  it("escalates COMPLAINT from ML without phrase rules", () => {
    const result = runSalesNlpPipeline({
      comment: "lừa đảo à",
      catalog,
      pinnedProduct: glassesA,
      mlBridge: mockMlBridge("COMPLAINT", 0.88, "lừa đảo à"),
    });
    expect(result.isComplaintEscalation).toBe(true);
    expect(result.action).toBe("ESCALATE_TO_HOST");
    expect(result.intentSource).toBe("ml");
  });

  it("falls back to regex when ML unavailable", () => {
    const result = runSalesNlpPipeline({
      comment: "giá bao nhiêu",
      catalog,
      pinnedProduct: glassesA,
      mlBridge: null,
    });
    expect(result.intent).toBe("ASK_PRICE");
    expect(result.intentSource).toBe("regex");
  });

  it("does not hide son misclassification with phrase patches", () => {
    const result = runSalesNlpPipeline({
      comment: "son",
      catalog,
      pinnedProduct: glassesA,
      mlBridge: mockMlBridge("PURCHASE_INTENT", 0.83, "son"),
    });
    expect(result.intent).toBe("PURCHASE_INTENT");
    expect(result.contextSource).toBe("clarification");
    expect(result.suggestedReply).toContain("son");
  });
});

describe("pinned product context policy", () => {
  it('resolves bare "giá?" to pinned product via commerce intent', () => {
    const result = runSalesNlpPipeline({
      comment: "giá?",
      catalog,
      pinnedProduct: glassesA,
      mlBridge: mockMlBridge("ASK_PRICE", 0.9, "giá?"),
    });
    expect(result.intent).toBe("ASK_PRICE");
    expect(result.contextSource).toBe("pinned_product");
    expect(result.resolvedProduct?.id).toBe(glassesA.id);
  });

  it("answers pinned price for bare giá with ML ASK_PRICE", () => {
    const result = runSalesNlpPipeline({
      comment: "giá?",
      catalog,
      pinnedProduct: glassesA,
      mlBridge: mockMlBridge("ASK_PRICE", 0.9, "giá?"),
    });
    expect(result.intent).toBe("ASK_PRICE");
    expect(result.contextSource).toBe("pinned_product");
    expect(result.suggestedReply).toContain(glassesA.name);
  });

  it("explicit catalog match beats pinned product", () => {
    const result = runSalesNlpPipeline({
      comment: "Son Ruby Đỏ giá?",
      catalog,
      pinnedProduct: glassesA,
      mlBridge: mockMlBridge("ASK_PRICE", 0.91, "Son Ruby Đỏ giá?"),
    });
    expect(result.contextSource).toBe("catalog_match");
    expect(result.suggestedReply).toContain("Son Ruby Đỏ");
    expect(result.suggestedReply).not.toContain(glassesA.name);
  });

  it("does not answer pinned product for unrelated mention without catalog match", () => {
    const result = runSalesNlpPipeline({
      comment: "kem dưỡng đêm premium",
      catalog,
      pinnedProduct: glassesA,
      mlBridge: mockMlBridge("PRODUCT_INFO", 0.85, "kem dưỡng đêm premium"),
    });
    expect(result.contextSource).toBe("clarification");
    expect(result.suggestedReply).not.toContain(glassesA.name);
  });

  it("uses pinned product for deictic price question", () => {
    const result = runSalesNlpPipeline({
      comment: "cái này giá?",
      catalog,
      pinnedProduct: glassesA,
      mlBridge: mockMlBridge("ASK_PRICE", 0.9, "cái này giá?"),
    });
    expect(result.contextSource).toBe("pinned_product");
    expect(result.suggestedReply).toContain(glassesA.name);
  });
});

describe("deictic and pinned reference via context only", () => {
  it("binds em này via pinned context without intent phrase patch", () => {
    const result = runSalesNlpPipeline({
      comment: "em này",
      catalog,
      pinnedProduct: glassesA,
      mlBridge: mockMlBridge("PRODUCT_INFO", 0.87, "em này"),
    });
    expect(result.intent).toBe("ASK_PRODUCT_INFO");
    expect(result.contextSource).toBe("pinned_product");
    expect(result.suggestedReply).toContain("Bạn muốn hỏi gì về");
  });

  it("binds sp này via pinned context", () => {
    const result = runSalesNlpPipeline({
      comment: "sp này",
      catalog,
      pinnedProduct: glassesA,
      mlBridge: mockMlBridge("PRODUCT_INFO", 0.86, "sp này"),
    });
    expect(result.contextSource).toBe("pinned_product");
    expect(result.isComplaintEscalation).toBe(false);
  });

  it("binds sản phẩm ghim via pinned reference resolver", () => {
    const result = runSalesNlpPipeline({
      comment: "sản phẩm ghim",
      catalog,
      pinnedProduct: glassesA,
      mlBridge: mockMlBridge("PRODUCT_INFO", 0.9, "sản phẩm ghim"),
    });
    expect(result.contextSource).toBe("pinned_product");
    expect(result.suggestedReply).toContain("ghim");
  });
});
