import type { TranslationKey } from "../../i18n/translations";

const INTENT_TRANSLATION_KEYS: Record<string, TranslationKey> = {
  COMPLAINT: "intentComplaint",
  PURCHASE_INTENT: "intentPurchaseIntent",
  ASK_PRICE: "intentAskPrice",
  ASK_STOCK: "intentAskStock",
  ASK_LINK: "intentAskLink",
  ASK_SHIPPING: "intentAskShipping",
  ASK_PROMOTION: "intentAskPromotion",
  PRODUCT_INFO: "intentProductInfo",
  ASK_PRODUCT_INFO: "intentProductInfo",
  ASK_COLOR: "intentAskVariantColor",
  ASK_SIZE: "intentAskVariantColor",
  ASK_VARIANT: "intentAskVariantColor",
  COMPARE_PRODUCTS: "intentCompareProducts",
  CHITCHAT: "intentChitchat",
  SPAM_TOXIC: "intentSpamToxic",
  UNKNOWN: "intentUnknown",
};

export function getIntentTranslationKey(intentLabel: string): TranslationKey {
  const normalized = intentLabel.trim().toUpperCase();
  return INTENT_TRANSLATION_KEYS[normalized] ?? "intentUnknown";
}

export function formatIntentLabel(
  intentLabel: string,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  return t(getIntentTranslationKey(intentLabel));
}
