import type { SalesNlpIntent } from "./salesNlpTypes";
import { isRecognizedNlpIntent } from "./salesNlpTypes";
import {
  hasDeicticProductReference,
  isDeicticOnlyComment,
  isPinnedProductReference,
} from "./intentSignals";
import { normalizeText } from "./normalizeText";

/** Intents where an unresolved comment can anchor on the host's pinned product after ML intent is known. */
const PINNED_BINDABLE_INTENTS = new Set<SalesNlpIntent>([
  "ASK_PRICE",
  "ASK_STOCK",
  "ASK_COLOR",
  "ASK_SIZE",
  "ASK_LINK",
  "ASK_SHIPPING",
  "ASK_PROMOTION",
  "ASK_PRODUCT_INFO",
  "PURCHASE_INTENT",
]);

export function isPinnedBindableIntent(
  intent: SalesNlpIntent,
): intent is Exclude<SalesNlpIntent, "UNKNOWN" | "COMPARE_PRODUCTS"> {
  return isRecognizedNlpIntent(intent) && PINNED_BINDABLE_INTENTS.has(intent);
}

/** ASK_PRODUCT_INFO only anchors on pinned product for short or pin/deictic references. */
export function shouldAnchorProductInfoOnPinnedProduct(comment: string): boolean {
  if (
    isPinnedProductReference(comment) ||
    hasDeicticProductReference(comment) ||
    isDeicticOnlyComment(comment)
  ) {
    return true;
  }

  const tokens = normalizeText(comment).split(" ").filter(Boolean);
  return tokens.length <= 2;
}
