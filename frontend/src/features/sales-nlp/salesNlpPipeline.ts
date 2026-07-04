import { generateAnswer } from "./answerGenerator";
import { buildSalesNlpExplanation } from "./salesNlpExplanation";
import { decideAction, shouldReplyInChat } from "./actionDecider";
import { extractEntities } from "./entityExtractor";
import { classifyIntent } from "./intentClassifier";
import { normalizeText } from "./normalizeText";
import {
  resolveComparedProducts,
  type ProductResolution,
  type ProductResolutionSource,
} from "./productMentionResolver";
import { resolveProductContext } from "./productContextResolver";
import type { ProductContextSource } from "./productContextResolver";
import {
  buildDeicticIntentClarification,
  buildPurchaseClarificationReply,
  hasColorVariantQuestion,
  isCategoryListingQuestion,
  isDeicticOnlyComment,
  isPinnedProductReference,
  isSingleCategoryTokenOnly,
} from "./intentSignals";
import { isCategoryLevelQuestion } from "./productMentionResolver";
import { type IntentSource, type MlIntentBridge } from "./mlIntentBridge";
import { applyProductMentionIntentGuardrail } from "./productMentionIntentGuardrail";
import { buildCommerceSuggestedActions } from "../commerce/commerceIntentActions";
import {
  isRecognizedNlpIntent,
  type SalesNlpAction,
  type SalesNlpIntent,
  type SalesNlpPipelineInput,
  type SalesNlpPipelineResult,
} from "./salesNlpTypes";
import type { IntentClassification } from "./intentClassifier";

function boostConfidence(
  baseConfidence: number,
  productConfidence: number,
  entityCount: number,
): number {
  const productBoost = Math.min(0.08, productConfidence * 0.08);
  const entityBoost = Math.min(0.05, entityCount * 0.015);
  return Math.min(0.99, Number((baseConfidence + productBoost + entityBoost).toFixed(2)));
}

function mapContextSourceToLegacySource(
  source: ProductContextSource,
): ProductResolutionSource {
  switch (source) {
    case "catalog_match":
      return "mentioned_product";
    case "camera_vision":
    case "camera_context":
    case "pinned_product":
      return "pinned_product";
    case "clarification":
      return "ambiguous";
  }
}

function buildProductResolutionFromContext(
  contextResolution: ReturnType<typeof resolveProductContext>,
  fallbackProduct: ProductResolution["selectedProduct"],
): ProductResolution {
  const selectedProduct = contextResolution.product ?? fallbackProduct;
  return {
    selectedProduct,
    selectedProductId: selectedProduct.id,
    resolutionSource: mapContextSourceToLegacySource(contextResolution.source),
    contextSource: contextResolution.source,
    explanation: contextResolution.explanation,
    matchedProducts: contextResolution.product ? [contextResolution.product] : [],
    productConfidence: contextResolution.confidence,
    semanticSimilarity: null,
    searchDiagnostics: null,
    isAmbiguous: contextResolution.isClarification,
    matchedTerms: [contextResolution.source],
    clarificationQuestion: contextResolution.clarificationQuestion,
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

function resolveEffectiveIntent(
  intent: SalesNlpIntent,
  normalizedText: string,
  product: ProductResolution["selectedProduct"] | null,
): SalesNlpIntent {
  if (intent === "ASK_SIZE" && hasColorVariantQuestion(normalizedText)) {
    return "ASK_COLOR";
  }
  if (
    intent === "ASK_SIZE" &&
    product &&
    product.colors.length > 0 &&
    product.sizes.length === 0 &&
    /\bmau\b/.test(normalizedText)
  ) {
    return "ASK_COLOR";
  }
  return intent;
}

function buildPinnedProductInfoReply(productName: string): string {
  return `Shop đang ghim ${productName}. Bạn muốn hỏi giá, còn hàng, màu hay thông tin gì về sản phẩm này ạ?`;
}

export function runSalesNlpPipeline(input: SalesNlpPipelineInput): SalesNlpPipelineResult {
  const normalizedText = normalizeText(input.comment);
  const autoReplyInChat = input.autoReplyInChat ?? true;

  // 1) Intent: ML when available, else regex (no product-context intent patching).
  const regexClassification = classifyIntent(normalizedText);
  const mlBridge = input.mlBridge ?? null;
  const mlApplied = applyMlIntentBridge(regexClassification, mlBridge);
  const classification = mlApplied.classification;

  // 2) Product context: resolver only (pin/camera/catalog/clarification).
  const contextResolution = resolveProductContext({
    comment: input.comment,
    catalog: input.catalog,
    pinnedProductId: input.pinnedProduct.id,
    selectedCameraProductId: input.selectedCameraProductId ?? null,
    latestCameraProductId: input.latestCameraProductId ?? null,
    detectedCameraProductId: input.detectedCameraProductId ?? null,
    detectedCameraConfidence: input.detectedCameraConfidence ?? null,
  });
  const productResolution = buildProductResolutionFromContext(
    contextResolution,
    input.pinnedProduct,
  );
  const resolvedProduct = contextResolution.product;

  const comparedProducts = resolveComparedProducts(
    input.comment,
    input.catalog,
    input.pinnedProduct,
  );
  let effectiveIntent = resolveEffectiveIntent(
    classification.intent,
    normalizedText,
    resolvedProduct,
  );
  let isComplaintEscalation = mlApplied.isComplaintEscalation;

  const productMentionGuardrail = applyProductMentionIntentGuardrail({
    comment: input.comment,
    normalizedText,
    mlRawIntent: mlBridge?.mlIntent ?? null,
    intent: effectiveIntent,
    isComplaintEscalation,
    contextResolution,
  });
  if (productMentionGuardrail.applied) {
    effectiveIntent = productMentionGuardrail.intent;
    isComplaintEscalation = false;
  }

  const matchedProducts =
    effectiveIntent === "COMPARE_PRODUCTS" && comparedProducts.length >= 2
      ? comparedProducts
      : productResolution.matchedProducts;

  const entities = extractEntities(
    input.comment,
    resolvedProduct ?? input.pinnedProduct,
    matchedProducts.map((product) => product.id),
  );

  const confidence = isRecognizedNlpIntent(effectiveIntent)
    ? boostConfidence(
        classification.confidence,
        productResolution.productConfidence,
        entities.colors.length + entities.sizes.length + (entities.quantity ? 1 : 0),
      )
    : 0;

  const action = productMentionGuardrail.applied
    ? "AUTO_REPLY_SUGGESTED"
    : mlApplied.actionOverride ??
      (effectiveIntent === "UNKNOWN" &&
      (contextResolution.isClarification ||
        isDeicticOnlyComment(input.comment) ||
        isPinnedProductReference(input.comment))
        ? "AUTO_REPLY_SUGGESTED"
        : decideAction(effectiveIntent, autoReplyInChat));

  const commerceActions =
    isRecognizedNlpIntent(effectiveIntent) &&
    resolvedProduct &&
    !contextResolution.isClarification
      ? buildCommerceSuggestedActions(effectiveIntent, resolvedProduct, entities)
      : [];

  let suggestedReply = "";

  if (productMentionGuardrail.applied && mlApplied.suggestedReplyOverride) {
    suggestedReply = "";
  } else if (mlApplied.suggestedReplyOverride) {
    suggestedReply = mlApplied.suggestedReplyOverride;
  } else if (
    contextResolution.isClarification &&
    contextResolution.clarificationQuestion &&
    (isSingleCategoryTokenOnly(input.comment) ||
      isCategoryListingQuestion(input.comment) ||
      isCategoryLevelQuestion(normalizedText))
  ) {
    suggestedReply = contextResolution.clarificationQuestion;
  } else if (effectiveIntent === "PURCHASE_INTENT") {
    if (!resolvedProduct) {
      suggestedReply = buildPurchaseClarificationReply();
    } else {
      suggestedReply = buildPurchaseClarificationReply(resolvedProduct.name);
    }
  } else if (contextResolution.isClarification && contextResolution.clarificationQuestion) {
    suggestedReply = contextResolution.clarificationQuestion;
  } else if (isPinnedProductReference(input.comment) && resolvedProduct) {
    suggestedReply = buildPinnedProductInfoReply(resolvedProduct.name);
  } else if (
    isDeicticOnlyComment(input.comment) &&
    resolvedProduct &&
    (effectiveIntent === "UNKNOWN" || effectiveIntent === "ASK_PRODUCT_INFO")
  ) {
    suggestedReply = buildDeicticIntentClarification(resolvedProduct.name);
  } else if (isRecognizedNlpIntent(effectiveIntent) && resolvedProduct) {
    if (productResolution.isAmbiguous && productResolution.clarificationQuestion) {
      suggestedReply = productResolution.clarificationQuestion;
    } else {
      suggestedReply = generateAnswer(
        effectiveIntent,
        resolvedProduct,
        entities,
        comparedProducts,
      );
    }
  }

  return {
    normalizedText,
    intent: effectiveIntent,
    confidence,
    matchedPatterns: [
      ...classification.matchedPatterns,
      contextResolution.source,
      ...productResolution.matchedTerms.filter((term) => term !== "pinned fallback"),
    ],
    action,
    resolvedProduct: resolvedProduct ?? input.pinnedProduct,
    productResolution,
    resolutionSource: productResolution.resolutionSource,
    contextSource: contextResolution.source,
    contextExplanation: contextResolution.explanation,
    matchedProducts,
    selectedProductId: resolvedProduct?.id ?? input.pinnedProduct.id,
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
    isComplaintEscalation,
    isSpamModeration: mlApplied.isSpamModeration,
    commerceActions,
    explanation: buildSalesNlpExplanation({
      comment: input.comment,
      normalizedText,
      regexClassification,
      mlApplied,
      mlBridge: input.mlBridge,
      contextResolution,
      productResolution,
      catalog: input.catalog,
      intent: effectiveIntent,
      confidence,
      action,
      suggestedReply,
      autoReplyInChat,
    }),
  };
}
