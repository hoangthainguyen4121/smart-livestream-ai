import { describe, expect, it } from "vitest";

import { mapExplainableContextSource } from "./salesNlpExplanation";
import { runSalesNlpPipeline } from "./salesNlpPipeline";
import { DEMO_PRODUCTS } from "../product-catalog/products";

describe("sales NLP explanation", () => {
  it("exposes structured explain output for a pinned price question", () => {
    const pinnedProduct = DEMO_PRODUCTS[0];
    const result = runSalesNlpPipeline({
      comment: "cái này giá bn",
      catalog: DEMO_PRODUCTS,
      pinnedProduct,
      autoReplyInChat: true,
      mlBridge: null,
    });

    expect(result.explanation.comment).toBe("cái này giá bn");
    expect(result.explanation.normalizedText).toContain("gia");
    expect(result.explanation.intent).toBe("ASK_PRICE");
    expect(result.explanation.contextSource).toBe("pinned_product");
    expect(result.explanation.resolvedProductId).toBe(pinnedProduct.id);
    expect(result.explanation.actionReason.length).toBeGreaterThan(0);
    expect(result.explanation.reply.length).toBeGreaterThan(0);
  });

  it("maps catalog match explanations to explicit vs candidate", () => {
    expect(
      mapExplainableContextSource({
        product: DEMO_PRODUCTS[2],
        source: "catalog_match",
        confidence: 0.9,
        explanation: 'Explicit catalog match via son ruby.',
        clarificationQuestion: null,
        isClarification: false,
      }),
    ).toBe("explicit_catalog_match");

    expect(
      mapExplainableContextSource({
        product: DEMO_PRODUCTS[2],
        source: "catalog_match",
        confidence: 0.7,
        explanation: 'Catalog candidate "Son Ruby Đỏ" above confidence threshold.',
        clarificationQuestion: null,
        isClarification: false,
      }),
    ).toBe("catalog_candidate");
  });
});
