import { describe, expect, it } from "vitest";

import { isPinnedBindableIntent } from "./pinnedContextPolicy";

describe("pinnedContextPolicy", () => {
  it("allows commerce intents to bind pinned product", () => {
    expect(isPinnedBindableIntent("ASK_PRICE")).toBe(true);
    expect(isPinnedBindableIntent("ASK_STOCK")).toBe(true);
    expect(isPinnedBindableIntent("ASK_COLOR")).toBe(true);
    expect(isPinnedBindableIntent("PURCHASE_INTENT")).toBe(true);
  });

  it("blocks product info and compare intents from pinned binding", () => {
    expect(isPinnedBindableIntent("UNKNOWN")).toBe(false);
    expect(isPinnedBindableIntent("COMPARE_PRODUCTS")).toBe(false);
    expect(isPinnedBindableIntent("ASK_PRODUCT_INFO")).toBe(false);
  });
});
