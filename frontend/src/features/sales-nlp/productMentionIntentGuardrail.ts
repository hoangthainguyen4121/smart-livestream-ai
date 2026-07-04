import {
  hasCommerceQuestionSignal,
  hasComplaintOrSpamSignal,
  hasPurchaseActionVerb,
} from "./commerceSignal";
import type { ProductContextResolution } from "./productContextResolver";
import type { SalesNlpIntent } from "./salesNlpTypes";

export type ProductMentionGuardrailInput = {
  comment: string;
  normalizedText: string;
  mlRawIntent: string | null;
  intent: SalesNlpIntent;
  isComplaintEscalation: boolean;
  contextResolution: ProductContextResolution;
};

export type ProductMentionGuardrailResult = {
  intent: SalesNlpIntent;
  applied: boolean;
  reason: string | null;
};

function hasClearCatalogProductMatch(context: ProductContextResolution): boolean {
  return (
    context.source === "catalog_match" &&
    context.product !== null &&
    !context.isClarification
  );
}

function isMisclassifiedProductMentionIntent(
  mlRawIntent: string | null,
  intent: SalesNlpIntent,
  isComplaintEscalation: boolean,
): boolean {
  const ml = mlRawIntent?.trim().toUpperCase() ?? "";
  if (ml === "PURCHASE_INTENT" || ml === "COMPLAINT") {
    return true;
  }
  if (intent === "PURCHASE_INTENT") {
    return true;
  }
  return isComplaintEscalation;
}

/**
 * Structural guardrail: catalog product mention without commerce/complaint cues
 * should not finalize as PURCHASE or COMPLAINT.
 */
export function applyProductMentionIntentGuardrail(
  input: ProductMentionGuardrailInput,
): ProductMentionGuardrailResult {
  const { normalizedText, mlRawIntent, intent, isComplaintEscalation, contextResolution } =
    input;

  if (!hasClearCatalogProductMatch(contextResolution)) {
    return { intent, applied: false, reason: null };
  }

  if (!isMisclassifiedProductMentionIntent(mlRawIntent, intent, isComplaintEscalation)) {
    return { intent, applied: false, reason: null };
  }

  if (hasPurchaseActionVerb(normalizedText)) {
    return { intent, applied: false, reason: null };
  }

  if (hasComplaintOrSpamSignal(normalizedText)) {
    return { intent, applied: false, reason: null };
  }

  if (hasCommerceQuestionSignal(normalizedText)) {
    return { intent, applied: false, reason: null };
  }

  return {
    intent: "ASK_PRODUCT_INFO",
    applied: true,
    reason: "catalog_product_mention_without_commerce_or_complaint_cue",
  };
}
