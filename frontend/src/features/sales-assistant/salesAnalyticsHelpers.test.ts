import { describe, expect, it } from "vitest";

import { createInitialAnalytics } from "./salesAssistantTypes";
import { getMostAskedProduct, getTopAskedProducts } from "./salesAnalyticsHelpers";

describe("salesAnalyticsHelpers", () => {
  it("ranks products by resolved question count", () => {
    const analytics = {
      ...createInitialAnalytics(),
      productQuestionCounts: {
        "bucket-hat": 1,
        "lipstick-ruby": 3,
      },
      mostAskedProductId: "lipstick-ruby",
    };

    const ranked = getTopAskedProducts(analytics);
    expect(ranked[0]?.productId).toBe("lipstick-ruby");
    expect(ranked[0]?.count).toBe(3);
    expect(getMostAskedProduct(analytics)?.productName).toBe("Son Ruby Đỏ");
  });
});
