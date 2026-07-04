import type { Locale } from "../../i18n/translations";
import type { IntentSource } from "../sales-nlp/mlIntentBridge";
import type { ProductContextSource } from "../sales-nlp/salesNlpTypes";
import type { SalesAssistantAction, SalesIntent } from "./salesAssistantTypes";

const INTENT_LABELS_VI: Record<Exclude<SalesIntent, "UNKNOWN">, string> = {
  ASK_PRICE: "Hỏi giá",
  ASK_STOCK: "Hỏi tồn kho",
  ASK_COLOR: "Hỏi màu",
  ASK_SIZE: "Hỏi size",
  ASK_LINK: "Xin link",
  ASK_SHIPPING: "Hỏi giao hàng",
  ASK_PROMOTION: "Hỏi khuyến mãi",
  ASK_PRODUCT_INFO: "Hỏi thông tin SP",
  COMPARE_PRODUCTS: "So sánh SP",
  PURCHASE_INTENT: "Muốn mua",
};

const INTENT_LABELS_EN: Record<Exclude<SalesIntent, "UNKNOWN">, string> = {
  ASK_PRICE: "Ask price",
  ASK_STOCK: "Ask stock",
  ASK_COLOR: "Ask color",
  ASK_SIZE: "Ask size",
  ASK_LINK: "Ask link",
  ASK_SHIPPING: "Ask shipping",
  ASK_PROMOTION: "Ask promotion",
  ASK_PRODUCT_INFO: "Ask product info",
  COMPARE_PRODUCTS: "Compare products",
  PURCHASE_INTENT: "Purchase intent",
};

const ACTION_LABELS_VI: Record<SalesAssistantAction, string> = {
  AUTO_REPLY_SUGGESTED: "Gợi ý trả lời tự động",
  INBOX_SUGGESTED: "Gợi ý trả lời inbox",
  ESCALATE_TO_HOST: "Chuyển cho host",
  IGNORE: "Bỏ qua",
};

const ACTION_LABELS_EN: Record<SalesAssistantAction, string> = {
  AUTO_REPLY_SUGGESTED: "Auto reply suggested",
  INBOX_SUGGESTED: "Inbox suggested",
  ESCALATE_TO_HOST: "Escalate to host",
  IGNORE: "Ignore",
};

export function getIntentDisplayLabel(
  intent: SalesIntent | "UNKNOWN",
  locale: Locale = "vi",
): string {
  if (intent === "UNKNOWN") {
    return locale === "vi" ? "Không rõ" : "Unknown";
  }

  return locale === "vi" ? INTENT_LABELS_VI[intent] : INTENT_LABELS_EN[intent];
}

export function getActionDisplayLabel(
  action: SalesAssistantAction,
  locale: Locale = "vi",
): string {
  return locale === "vi" ? ACTION_LABELS_VI[action] : ACTION_LABELS_EN[action];
}

export function getIntentSourceDisplayLabel(
  source: IntentSource,
  locale: Locale = "vi",
): string {
  if (locale === "en") {
    if (source === "ml") {
      return "PhoBERT";
    }
    return source === "regex_fallback" ? "Rules fallback" : "Rules";
  }

  if (source === "ml") {
    return "PhoBERT";
  }
  return source === "regex_fallback" ? "Luật dự phòng" : "Luật";
}

const CONTEXT_LABELS_VI: Record<ProductContextSource, string> = {
  camera_vision: "Nhận diện camera thử nghiệm",
  camera_context: "Ngữ cảnh camera thủ công",
  pinned_product: "Sản phẩm đang ghim",
  catalog_match: "Khớp trực tiếp với danh mục sản phẩm",
  clarification: "Cần hỏi rõ sản phẩm",
};

const CONTEXT_LABELS_EN: Record<ProductContextSource, string> = {
  camera_vision: "Experimental camera recognition",
  camera_context: "Manual camera context",
  pinned_product: "Pinned product",
  catalog_match: "Direct catalog match",
  clarification: "Needs product clarification",
};

export function getContextSourceDisplayLabel(
  source: ProductContextSource,
  locale: Locale = "vi",
): string {
  return locale === "vi" ? CONTEXT_LABELS_VI[source] : CONTEXT_LABELS_EN[source];
}
