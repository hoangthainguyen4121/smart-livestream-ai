import type { Locale } from "../../i18n/translations";
import { getMostAskedProduct } from "./salesAnalyticsHelpers";
import type { SalesAssistantAnalytics } from "./salesAssistantTypes";

export function generateSalesRecommendations(
  analytics: SalesAssistantAnalytics,
  locale: Locale = "vi",
): string[] {
  const recommendations: string[] = [];
  const topProduct = getMostAskedProduct(analytics);
  const isVi = locale === "vi";

  if (analytics.complaintCount > 0) {
    recommendations.push(
      isVi
        ? "Có khiếu nại từ khách. Nên xin lỗi và chuyển xử lý thủ công ngay."
        : "Complaints detected. Apologize and handle manually immediately.",
    );
  }

  if (analytics.hotLeads > 0 || analytics.purchaseIntentCount > 0) {
    recommendations.push(
      isVi
        ? "Có khách có ý định mua. Nên ưu tiên phản hồi ngay và hướng dẫn chốt đơn."
        : "Potential buyers detected. Prioritize immediate follow-up and checkout guidance.",
    );
  }

  if (topProduct && topProduct.count >= 2) {
    recommendations.push(
      isVi
        ? `Khách đang hỏi nhiều về ${topProduct.productName}. Nên nhắc lại giá và ghim sản phẩm này.`
        : `Viewers are asking about ${topProduct.productName}. Restate the price and pin this product.`,
    );
  } else if (topProduct && topProduct.count === 1) {
    recommendations.push(
      isVi
        ? `Có câu hỏi về ${topProduct.productName}. Nên giữ sản phẩm này trong ngữ cảnh live.`
        : `A question about ${topProduct.productName}. Keep this product in live context.`,
    );
  }

  if (analytics.priceQuestions >= 2) {
    recommendations.push(
      isVi
        ? "Có nhiều câu hỏi về giá. Nên nói rõ giá trên live và ghim sản phẩm."
        : "Many price questions. State the price on stream and pin the product.",
    );
  } else if (analytics.priceQuestions === 1) {
    recommendations.push(
      isVi
        ? "Có câu hỏi về giá. Nên trả lời giá ngay trên live."
        : "A price question detected. Answer the price on stream.",
    );
  }

  if (analytics.stockQuestions >= 2) {
    recommendations.push(
      isVi
        ? "Có nhiều câu hỏi về tồn kho. Nên xác nhận còn hàng và màu/size còn lại."
        : "Many stock questions. Confirm availability and remaining variants.",
    );
  } else if (analytics.stockQuestions === 1) {
    recommendations.push(
      isVi
        ? "Có câu hỏi về tồn kho. Nên xác nhận còn hàng."
        : "A stock question detected. Confirm availability.",
    );
  }

  if (analytics.linkRequests >= 1) {
    recommendations.push(
      isVi
        ? "Có khách xin link sản phẩm. Nên ghim sản phẩm hoặc gửi link ngay."
        : "Link requests detected. Pin the product or share the link now.",
    );
  }

  if (analytics.colorQuestions >= 2) {
    recommendations.push(
      isVi
        ? "Nhiều khách hỏi về màu. Nên liệt kê màu còn hàng trên live."
        : "Many color questions. List available colors on stream.",
    );
  }

  if (analytics.clarificationCount >= 1 || analytics.unknownComments >= 2) {
    recommendations.push(
      isVi
        ? "Có nhiều câu hỏi mơ hồ. Nên đánh dấu sản phẩm đang trong camera hoặc ghim sản phẩm."
        : "Ambiguous questions detected. Mark the on-camera product or pin a product.",
    );
  }

  if ((analytics.questionsByIntent.ASK_SHIPPING ?? 0) >= 1) {
    recommendations.push(
      isVi
        ? "Có câu hỏi giao hàng. Nên xác nhận khu vực giao và phí ship."
        : "Shipping questions detected. Confirm delivery areas and fees.",
    );
  }

  if ((analytics.questionsByIntent.ASK_PROMOTION ?? 0) >= 1) {
    recommendations.push(
      isVi
        ? "Có câu hỏi khuyến mãi. Nên xác nhận ưu đãi đang áp dụng (nếu có)."
        : "Promotion questions detected. Confirm current offers if available.",
    );
  }

  if ((analytics.questionsByIntent.COMPARE_PRODUCTS ?? 0) >= 1) {
    recommendations.push(
      isVi
        ? "Có câu hỏi so sánh sản phẩm. Nên giới thiệu hoặc so sánh trực tiếp trên live."
        : "Comparison questions detected. Compare products live on stream.",
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      isVi
        ? "Chưa có câu hỏi mua hàng. Gợi ý khách hỏi về giá, màu hoặc cách mua."
        : "No product questions yet. Prompt viewers to ask about price, colors, or how to buy.",
    );
  }

  return recommendations;
}
