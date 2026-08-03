import { describe, expect, it } from "vitest";

import { isPinnedBindableIntent, shouldAnchorProductInfoOnPinnedProduct } from "./pinnedContextPolicy";

describe("pinnedContextPolicy", () => {
  it("allows commerce and product-info intents to bind pinned product", () => {
    expect(isPinnedBindableIntent("ASK_PRICE")).toBe(true);
    expect(isPinnedBindableIntent("ASK_STOCK")).toBe(true);
    expect(isPinnedBindableIntent("ASK_COLOR")).toBe(true);
    expect(isPinnedBindableIntent("ASK_PRODUCT_INFO")).toBe(true);
    expect(isPinnedBindableIntent("PURCHASE_INTENT")).toBe(true);
  });

  it("blocks unknown and compare intents from pinned binding", () => {
    expect(isPinnedBindableIntent("UNKNOWN")).toBe(false);
    expect(isPinnedBindableIntent("COMPARE_PRODUCTS")).toBe(false);
  });

  it("anchors product-info on pinned product for short or pin/deictic comments", () => {
    expect(shouldAnchorProductInfoOnPinnedProduct("ghim")).toBe(true);
    expect(shouldAnchorProductInfoOnPinnedProduct("sản phẩm ghim")).toBe(true);
    expect(shouldAnchorProductInfoOnPinnedProduct("em này")).toBe(true);
    expect(shouldAnchorProductInfoOnPinnedProduct("kem dưỡng đêm premium")).toBe(false);
  });
});
