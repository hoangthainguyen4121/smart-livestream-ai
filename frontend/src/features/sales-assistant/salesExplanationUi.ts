import type { SalesNlpExplanation } from "../sales-nlp/salesNlpTypes";
import type { TranslationKey } from "../../i18n/translations";

const COMMERCE_ML_LABELS = new Set([
  "ASK_PRICE",
  "ASK_STOCK",
  "ASK_LINK",
  "ASK_SHIPPING",
  "ASK_PROMOTION",
  "PRODUCT_INFO",
  "ASK_VARIANT",
  "PURCHASE_INTENT",
]);

export function getExplanationWarningKey(
  explanation: SalesNlpExplanation,
  mlConfidence: number | null,
): TranslationKey | null {
  const wordCount = explanation.normalizedText.split(/\s+/).filter(Boolean).length;
  const isShort = wordCount <= 4;
  const regexSilent = explanation.regexIntent === "UNKNOWN";
  const mlUsed = explanation.intentSource === "ml";
  const mlHigh = (mlConfidence ?? explanation.confidence) >= 0.65;
  const mlLabel = explanation.mlRawIntent?.trim().toUpperCase() ?? "";
  const commerceMl = COMMERCE_ML_LABELS.has(mlLabel);
  const finalCommerce = explanation.intent !== "UNKNOWN" && !explanation.suppressEvent;

  if (mlUsed && mlHigh && regexSilent && commerceMl && finalCommerce) {
    return "explainWarningMlRegexDisagree";
  }

  if (mlUsed && isShort && commerceMl && finalCommerce) {
    return "explainWarningShortGeneric";
  }

  return null;
}
