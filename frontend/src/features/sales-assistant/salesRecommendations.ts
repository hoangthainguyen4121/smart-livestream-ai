import type { SalesAssistantAnalytics } from "./salesAssistantTypes";

export function generateSalesRecommendations(analytics: SalesAssistantAnalytics): string[] {
  const recommendations: string[] = [];

  if (analytics.hotLeads > 0 || analytics.purchaseIntentCount > 0) {
    recommendations.push(
      "Potential buyers detected. Host should follow up immediately.",
    );
  }

  if (analytics.priceQuestions >= 2) {
    recommendations.push(
      "Many viewers are asking about price. Mention the price verbally and pin the product.",
    );
  } else if (analytics.priceQuestions === 1) {
    recommendations.push("A viewer asked about price. Consider stating the price on stream.");
  }

  if (analytics.linkRequests >= 1) {
    recommendations.push(
      "Many viewers are requesting the product link. Pin the product link now.",
    );
  }

  if ((analytics.questionsByIntent.ASK_SHIPPING ?? 0) >= 1) {
    recommendations.push(
      "Shipping questions detected. Confirm delivery areas manually via inbox.",
    );
  }

  if ((analytics.questionsByIntent.ASK_PROMOTION ?? 0) >= 1) {
    recommendations.push(
      "Promotion questions detected. Confirm current offers on stream if available.",
    );
  }

  if ((analytics.questionsByIntent.COMPARE_PRODUCTS ?? 0) >= 1) {
    recommendations.push(
      "Comparison questions detected. Show both products or explain differences live.",
    );
  }

  if (recommendations.length === 0 && analytics.totalProductQuestions === 0) {
    recommendations.push(
      "No product questions yet. Prompt viewers to ask about price, colors, or how to buy.",
    );
  }

  return recommendations;
}
