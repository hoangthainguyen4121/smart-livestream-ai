import { describe, expect, it } from "vitest";

import { createInitialAnalytics } from "./salesAssistantTypes";
import { generateSalesRecommendations } from "./salesRecommendations";

describe("generateSalesRecommendations", () => {
  it("suggests pinning the most asked product in Vietnamese", () => {
    const analytics = {
      ...createInitialAnalytics(),
      productQuestionCounts: { "lipstick-ruby": 3, "bucket-hat": 1 },
      mostAskedProductId: "lipstick-ruby",
      totalProductQuestions: 4,
    };

    const recommendations = generateSalesRecommendations(analytics, "vi");
    expect(recommendations.some((item) => item.includes("Son Ruby"))).toBe(true);
    expect(recommendations.some((item) => item.includes("ghim"))).toBe(true);
  });

  it("suggests stock confirmation after multiple stock questions", () => {
    const analytics = {
      ...createInitialAnalytics(),
      stockQuestions: 2,
      totalProductQuestions: 2,
    };

    const recommendations = generateSalesRecommendations(analytics, "vi");
    expect(recommendations.some((item) => item.includes("tồn kho"))).toBe(true);
  });

  it("suggests clarification when ambiguous comments accumulate", () => {
    const analytics = {
      ...createInitialAnalytics(),
      clarificationCount: 1,
      unknownComments: 0,
    };

    const recommendations = generateSalesRecommendations(analytics, "vi");
    expect(recommendations.some((item) => item.includes("mơ hồ"))).toBe(true);
  });

  it("prioritizes purchase intent guidance", () => {
    const analytics = {
      ...createInitialAnalytics(),
      purchaseIntentCount: 1,
      hotLeads: 1,
    };

    const recommendations = generateSalesRecommendations(analytics, "vi");
    expect(recommendations[0]).toContain("ý định mua");
  });
});
