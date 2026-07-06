import type { SalesNlpIntent } from "./salesNlpTypes";
import { isRecognizedNlpIntent } from "./salesNlpTypes";

/** Commerce intents where a bare/live comment can anchor on pinned product (not general product info). */
const PINNED_BINDABLE_INTENTS = new Set<SalesNlpIntent>([
  "ASK_PRICE",
  "ASK_STOCK",
  "ASK_COLOR",
  "ASK_SIZE",
  "ASK_LINK",
  "ASK_SHIPPING",
  "ASK_PROMOTION",
  "PURCHASE_INTENT",
]);

export function isPinnedBindableIntent(
  intent: SalesNlpIntent,
): intent is Exclude<SalesNlpIntent, "UNKNOWN" | "COMPARE_PRODUCTS" | "ASK_PRODUCT_INFO"> {
  return isRecognizedNlpIntent(intent) && PINNED_BINDABLE_INTENTS.has(intent);
}
