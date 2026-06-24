import { generateAnswer } from "./answerGenerator";
import { decideAction, shouldReplyInChat } from "./actionDecider";
import { extractEntities } from "./entityExtractor";
import { classifyIntent, type IntentClassification } from "./intentClassifier";
import { normalizeText } from "./normalizeText";
import {
  resolveComparedProducts,
  resolveProductSelection,
} from "./productMentionResolver";
import type { ProductResolution } from "./productMentionResolver";
import type { IntentSource, MlIntentBridge } from "./mlIntentBridge";
import { buildCommerceSuggestedActions } from "../commerce/commerceIntentActions";
import {
  isRecognizedNlpIntent,
  type SalesNlpAction,
  type SalesNlpIntent,
  type SalesNlpPipelineInput,
  type SalesNlpPipelineResult,
} from "./salesNlpTypes";

function boostConfidence(
  baseConfidence: number,
  productConfidence: number,
  entityCount: number,
): number {
  const productBoost = Math.min(0.08, productConfidence * 0.08);
  const entityBoost = Math.min(0.05, entityCount * 0.015);
  return Math.min(0.99, Number((baseConfidence + productBoost + entityBoost).toFixed(2)));
}

function inferIntentFromProductResolution(
  classification: IntentClassification,
  productResolution: ProductResolution,
  normalizedText: string,
): IntentClassification {
  if (classification.intent !== "UNKNOWN") {
    return classification;
  }

  if (/\bmau\b/.test(normalizedText) || /\bco .+ (xanh|den|do|vang|trang)\b/.test(normalizedText)) {
    return classification;
  }

  const resolutionSource = productResolution.resolutionSource;
  if (resolutionSource === "pinned_product" || resolutionSource === "none") {
    return classification;
  }

  const matchedTerms = productResolution.matchedTerms.filter(
    (term) => term !== "pinned fallback",
  );
  if (matchedTerms.length === 0 && resolutionSource !== "semantic_search") {
    return classification;
  }

  const baseConfidence =
    resolutionSource === "semantic_search"
      ? 0.8
      : resolutionSource === "mentioned_product"
        ? 0.78
        : 0.74;

  const intent: Exclude<SalesNlpIntent, "UNKNOWN"> = "ASK_PRODUCT_INFO";

  return {
    intent,
    confidence: productResolution.isAmbiguous
      ? Number((baseConfidence - 0.06).toFixed(2))
      : baseConfidence,
    matchedPatterns: [
      resolutionSource === "semantic_search"
        ? "semantic product search"
        : "product resolution",
      ...matchedTerms.slice(0, 3),
    ],
  };
}

function applyMlIntentBridge(
  regexClassification: IntentClassification,
  mlBridge: MlIntentBridge | null | undefined,
): {
  classification: IntentClassification;
  actionOverride: SalesNlpAction | null;
  intentSource: IntentSource;
  suppressEvent: boolean;
  isComplaintEscalation: boolean;
  isSpamModeration: boolean;
  suggestedReplyOverride: string | null;
} {
  if (!mlBridge?.usedMl) {
    return {
      classification: regexClassification,
      actionOverride: null,
      intentSource: mlBridge?.mlAvailable ? "regex_fallback" : "regex",
      suppressEvent: false,
      isComplaintEscalation: false,
      isSpamModeration: false,
      suggestedReplyOverride: null,
    };
  }

  if (mlBridge.suppressEvent) {
    return {
      classification: {
        intent: "UNKNOWN",
        confidence: mlBridge.mlConfidence,
        matchedPatterns: [`ml:${mlBridge.mlIntent ?? "unknown"}`],
      },
      actionOverride: "IGNORE",
      intentSource: "ml",
      suppressEvent: true,
      isComplaintEscalation: false,
      isSpamModeration: mlBridge.isSpamModeration,
      suggestedReplyOverride: null,
    };
  }

  const classification: IntentClassification = {
    intent: mlBridge.mappedIntent,
    confidence: mlBridge.mlConfidence,
    matchedPatterns: [`ml:${mlBridge.mlIntent ?? "unknown"}`],
  };

  let suggestedReplyOverride: string | null = null;
  if (mlBridge.isComplaintEscalation) {
    suggestedReplyOverride =
      "Cảm ơn bạn đã phản hồi. Host sẽ kiểm tra và phản hồi qua inbox.";
  }

  return {
    classification,
    actionOverride: mlBridge.mappedAction,
    intentSource: "ml",
    suppressEvent: false,
    isComplaintEscalation: mlBridge.isComplaintEscalation,
    isSpamModeration: mlBridge.isSpamModeration,
    suggestedReplyOverride,
  };
}

export function runSalesNlpPipeline(input: SalesNlpPipelineInput): SalesNlpPipelineResult {
  const normalizedText = normalizeText(input.comment);
  const autoReplyInChat = input.autoReplyInChat ?? true;
  const productResolution = resolveProductSelection(
    input.comment,
    input.catalog,
    input.pinnedProduct,
  );
  const comparedProducts = resolveComparedProducts(
    input.comment,
    input.catalog,
    input.pinnedProduct,
  );
  const regexClassification = inferIntentFromProductResolution(
    classifyIntent(normalizedText),
    productResolution,
    normalizedText,
  );
  const mlApplied = applyMlIntentBridge(regexClassification, input.mlBridge);
  const classification = mlApplied.classification;
  const matchedProducts =
    classification.intent === "COMPARE_PRODUCTS" && comparedProducts.length >= 2
      ? comparedProducts
      : productResolution.matchedProducts;
  const mentionedProductIds = matchedProducts.map((product) => product.id);

  const entities = extractEntities(
    input.comment,
    productResolution.selectedProduct,
    mentionedProductIds,
  );

  const confidence = isRecognizedNlpIntent(classification.intent)
    ? boostConfidence(
        classification.confidence,
        productResolution.productConfidence,
        entities.colors.length + entities.sizes.length + (entities.quantity ? 1 : 0),
      )
    : 0;

  const action = mlApplied.actionOverride ?? decideAction(classification.intent, autoReplyInChat);
  const commerceActions = isRecognizedNlpIntent(classification.intent)
    ? buildCommerceSuggestedActions(classification.intent, productResolution.selectedProduct, entities)
    : [];
  let suggestedReply = "";

  if (mlApplied.suggestedReplyOverride) {
    suggestedReply = mlApplied.suggestedReplyOverride;
  } else if (isRecognizedNlpIntent(classification.intent)) {
    if (productResolution.isAmbiguous && productResolution.clarificationQuestion) {
      suggestedReply = productResolution.clarificationQuestion;
    } else {
      suggestedReply = generateAnswer(
        classification.intent,
        productResolution.selectedProduct,
        entities,
        comparedProducts,
      );
    }
  }

  return {
    normalizedText,
    intent: classification.intent,
    confidence,
    matchedPatterns: [
      ...classification.matchedPatterns,
      ...productResolution.matchedTerms.filter((term) => term !== "pinned fallback"),
    ],
    action,
    resolvedProduct: productResolution.selectedProduct,
    productResolution,
    resolutionSource: productResolution.resolutionSource,
    matchedProducts,
    selectedProductId: productResolution.selectedProductId,
    productConfidence: productResolution.productConfidence,
    semanticSimilarity: productResolution.semanticSimilarity,
    searchDiagnostics: productResolution.searchDiagnostics,
    comparedProducts,
    entities,
    suggestedReply,
    shouldReplyInChat: shouldReplyInChat(action),
    mlBridge: input.mlBridge ?? null,
    mlRawIntent: input.mlBridge?.mlIntent ?? null,
    mlConfidence: input.mlBridge?.usedMl ? input.mlBridge.mlConfidence : null,
    intentSource: mlApplied.intentSource,
    suppressEvent: mlApplied.suppressEvent,
    isComplaintEscalation: mlApplied.isComplaintEscalation,
    isSpamModeration: mlApplied.isSpamModeration,
    commerceActions,
  };
}
