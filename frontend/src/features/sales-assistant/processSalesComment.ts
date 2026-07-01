import { getAllProducts, getDefaultPinnedProduct, getProductById } from "../product-catalog";
import type { CatalogProduct } from "../product-catalog";
import { predictIntent } from "../../api/nlpIntent";
import { classifyIntent } from "../sales-nlp/intentClassifier";
import { normalizeText } from "../sales-nlp/normalizeText";
import {
  buildChatMlIntentBadge,
  buildMlIntentBridge,
  type ChatMlIntentBadge,
  type MlIntentBridge,
} from "../sales-nlp/mlIntentBridge";
import { runSalesNlpPipeline } from "../sales-nlp/salesNlpPipeline";
import { isRecognizedNlpIntent } from "../sales-nlp/salesNlpTypes";
import {
  createInitialAnalytics,
  type SalesAssistantAnalytics,
  type SalesAssistantEvent,
} from "./salesAssistantTypes";

type ProcessSalesCommentInput = {
  comment: string;
  viewerAuthor: string;
  pinnedProduct?: CatalogProduct;
  catalog?: CatalogProduct[];
  selectedCameraProductId?: string | null;
  latestCameraProductId?: string | null;
  autoReplyInChat?: boolean;
  mlBridge?: MlIntentBridge | null;
};

export type ProcessSalesCommentResult = {
  event: SalesAssistantEvent | null;
  analytics: SalesAssistantAnalytics;
  chatMlBadge: ChatMlIntentBadge | null;
};

function createEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sales-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function incrementIntentCount(
  analytics: SalesAssistantAnalytics,
  intent: SalesAssistantEvent["intent"],
): Partial<Record<string, number>> {
  return {
    ...analytics.questionsByIntent,
    [intent]: (analytics.questionsByIntent[intent] ?? 0) + 1,
  };
}

function updateAnalytics(
  analytics: SalesAssistantAnalytics,
  event: SalesAssistantEvent | null,
): SalesAssistantAnalytics {
  if (!event) {
    return {
      ...analytics,
      unknownComments: analytics.unknownComments + 1,
    };
  }

  const productQuestionCounts = {
    ...analytics.productQuestionCounts,
    [event.productId]: (analytics.productQuestionCounts[event.productId] ?? 0) + 1,
  };
  const mostAskedProductId =
    Object.entries(productQuestionCounts).sort((left, right) => right[1] - left[1])[0]?.[0] ??
    null;
  const isPurchase = event.intent === "PURCHASE_INTENT";

  return {
    totalProductQuestions:
      analytics.totalProductQuestions + (isPurchase ? 0 : 1),
    priceQuestions: analytics.priceQuestions + (event.intent === "ASK_PRICE" ? 1 : 0),
    stockQuestions: analytics.stockQuestions + (event.intent === "ASK_STOCK" ? 1 : 0),
    colorQuestions: analytics.colorQuestions + (event.intent === "ASK_COLOR" ? 1 : 0),
    linkRequests: analytics.linkRequests + (event.intent === "ASK_LINK" ? 1 : 0),
    purchaseIntentCount: analytics.purchaseIntentCount + (isPurchase ? 1 : 0),
    hotLeads: analytics.hotLeads + (isPurchase ? 1 : 0),
    unknownComments: analytics.unknownComments,
    questionsByIntent: incrementIntentCount(analytics, event.intent),
    productQuestionCounts,
    mostAskedProductId,
  };
}

export function processSalesComment(
  input: ProcessSalesCommentInput,
  currentAnalytics: SalesAssistantAnalytics = createInitialAnalytics(),
): ProcessSalesCommentResult {
  const pinnedProduct = input.pinnedProduct ?? getDefaultPinnedProduct();
  const catalog = input.catalog ?? getAllProducts();
  const nlp = runSalesNlpPipeline({
    comment: input.comment,
    pinnedProduct,
    catalog,
    selectedCameraProductId: input.selectedCameraProductId ?? null,
    latestCameraProductId: input.latestCameraProductId ?? null,
    autoReplyInChat: input.autoReplyInChat ?? true,
    mlBridge: input.mlBridge ?? null,
  });

  const chatMlBadge = input.mlBridge
    ? buildChatMlIntentBadge(input.mlBridge, nlp.intent)
    : null;

  if (nlp.suppressEvent || !isRecognizedNlpIntent(nlp.intent) || nlp.action === "IGNORE") {
    return {
      event: null,
      analytics: updateAnalytics(currentAnalytics, null),
      chatMlBadge,
    };
  }

  const event: SalesAssistantEvent = {
    id: createEventId(),
    action: nlp.action,
    intent: nlp.intent,
    confidence: nlp.confidence,
    matchedPatterns: nlp.matchedPatterns,
    productId: nlp.resolvedProduct.id,
    selectedProductId: nlp.selectedProductId,
    resolvedProductName: nlp.resolvedProduct.name,
    resolutionSource: nlp.resolutionSource,
    contextSource: nlp.contextSource,
    contextExplanation: nlp.contextExplanation,
    productConfidence: nlp.productConfidence,
    semanticSimilarity: nlp.semanticSimilarity,
    searchDiagnostics: nlp.searchDiagnostics,
    matchedProducts: nlp.matchedProducts.map((product) => product.id),
    normalizedText: nlp.normalizedText,
    entities: nlp.entities,
    viewerComment: input.comment.trim(),
    viewerAuthor: input.viewerAuthor.trim() || "Viewer",
    suggestedReply: nlp.suggestedReply,
    createdAt: new Date().toISOString(),
    isPotentialBuyer: nlp.intent === "PURCHASE_INTENT",
    isComplaintEscalation: nlp.isComplaintEscalation,
    isSpamModeration: nlp.isSpamModeration,
    mlRawIntent: nlp.mlRawIntent,
    mlConfidence: nlp.mlConfidence,
    intentSource: nlp.intentSource,
    commerceActions: nlp.commerceActions,
  };

  return {
    event,
    analytics: updateAnalytics(currentAnalytics, event),
    chatMlBadge,
  };
}

export async function processSalesCommentWithMl(
  input: Omit<ProcessSalesCommentInput, "mlBridge">,
  currentAnalytics: SalesAssistantAnalytics = createInitialAnalytics(),
): Promise<ProcessSalesCommentResult> {
  const normalizedComment = normalizeText(input.comment);
  const regexClassification = classifyIntent(normalizedComment);
  const mlResponse = await predictIntent(input.comment);
  const mlBridge = buildMlIntentBridge(mlResponse, regexClassification, normalizedComment);
  return processSalesComment({ ...input, mlBridge }, currentAnalytics);
}

export function getIntentLabel(intent: SalesAssistantEvent["intent"] | "UNKNOWN"): string {
  return intent;
}

export function getActionLabel(action: SalesAssistantEvent["action"]): string {
  return action;
}

export function shouldAutoReplyInChat(event: SalesAssistantEvent): boolean {
  return event.action === "AUTO_REPLY_SUGGESTED" || event.action === "ESCALATE_TO_HOST";
}

// Legacy exports for older imports
export { getProductById, getDefaultPinnedProduct as getPinnedProduct } from "../product-catalog";
