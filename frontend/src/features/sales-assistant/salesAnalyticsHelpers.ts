import { getProductById } from "../product-catalog/productCatalogService";
import type { SalesAssistantAnalytics } from "./salesAssistantTypes";

export type RankedProductQuestion = {
  productId: string;
  productName: string;
  count: number;
};

export function getTopAskedProducts(
  analytics: SalesAssistantAnalytics,
  limit = 5,
): RankedProductQuestion[] {
  return Object.entries(analytics.productQuestionCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([productId, count]) => ({
      productId,
      count,
      productName: getProductById(productId)?.name ?? productId,
    }));
}

export function getMostAskedProduct(analytics: SalesAssistantAnalytics): RankedProductQuestion | null {
  return getTopAskedProducts(analytics, 1)[0] ?? null;
}
