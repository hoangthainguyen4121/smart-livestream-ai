// Source: smart-livestream-ml/schemas/livestream_v3_labels.schema.json
export const ML_INTENT_LABELS = [
  "ASK_PRICE",
  "ASK_STOCK",
  "ASK_VARIANT",
  "ASK_LINK",
  "ASK_SHIPPING",
  "ASK_PROMOTION",
  "PRODUCT_INFO",
  "PURCHASE_INTENT",
  "CHITCHAT",
  "COMPLAINT",
  "SPAM_TOXIC",
] as const;

export type MlIntentLabel = (typeof ML_INTENT_LABELS)[number];

export function isMlIntentLabel(value: string): value is MlIntentLabel {
  return ML_INTENT_LABELS.includes(value as MlIntentLabel);
}
