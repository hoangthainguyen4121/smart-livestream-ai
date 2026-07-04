import type { ExtractedEntities, SalesNlpAction, SalesNlpIntent, ProductContextSource } from "../sales-nlp/salesNlpTypes";
import type { ProductResolutionSource } from "../sales-nlp/productMentionResolver";
import type { ProductSearchDiagnostics } from "../product-search/productSearchTypes";
import type { IntentSource } from "../sales-nlp/mlIntentBridge";
import type { CommerceSuggestedAction } from "../commerce/commerceTypes";
import type { SalesNlpExplanation } from "../sales-nlp/salesNlpTypes";

export type ModelExplanationFeature = {
  token: string;
  weight: number;
};

export type ModelExplanationTopLabel = {
  label: string;
  confidence: number;
};

export type ModelExplanation = {
  predictedLabel: string;
  confidence: number;
  topLabels: ModelExplanationTopLabel[];
  positiveFeatures: ModelExplanationFeature[];
  negativeFeatures: ModelExplanationFeature[];
  source: "lime_lookup" | "ml_bridge";
};

export type SalesIntent = SalesNlpIntent;
export type SalesAssistantAction = SalesNlpAction;

export type SalesAssistantEvent = {
  id: string;
  action: SalesAssistantAction;
  intent: Exclude<SalesIntent, "UNKNOWN">;
  confidence: number;
  matchedPatterns: string[];
  productId: string;
  selectedProductId: string;
  resolvedProductName: string;
  resolutionSource: ProductResolutionSource;
  contextSource: ProductContextSource;
  contextExplanation: string;
  productConfidence: number;
  semanticSimilarity: number | null;
  searchDiagnostics: ProductSearchDiagnostics | null;
  matchedProducts: string[];
  normalizedText: string;
  entities: ExtractedEntities;
  viewerComment: string;
  viewerAuthor: string;
  suggestedReply: string;
  createdAt: string;
  isPotentialBuyer: boolean;
  isComplaintEscalation: boolean;
  isSpamModeration: boolean;
  mlRawIntent: string | null;
  mlConfidence: number | null;
  intentSource: IntentSource;
  commerceActions: CommerceSuggestedAction[];
  explanation: SalesNlpExplanation;
  modelExplanation?: ModelExplanation;
};

export type SalesAssistantAnalytics = {
  totalProductQuestions: number;
  priceQuestions: number;
  stockQuestions: number;
  colorQuestions: number;
  linkRequests: number;
  purchaseIntentCount: number;
  hotLeads: number;
  unknownComments: number;
  clarificationCount: number;
  complaintCount: number;
  questionsByIntent: Partial<Record<SalesIntent, number>>;
  productQuestionCounts: Record<string, number>;
  mostAskedProductId: string | null;
};

export const AI_SALES_ASSISTANT_ACTOR = "Trợ lý bán hàng";

export function createInitialAnalytics(): SalesAssistantAnalytics {
  return {
    totalProductQuestions: 0,
    priceQuestions: 0,
    stockQuestions: 0,
    colorQuestions: 0,
    linkRequests: 0,
    purchaseIntentCount: 0,
    hotLeads: 0,
    unknownComments: 0,
    clarificationCount: 0,
    complaintCount: 0,
    questionsByIntent: {},
    productQuestionCounts: {},
    mostAskedProductId: null,
  };
}

export function isRecognizedSalesIntent(
  intent: SalesIntent,
): intent is Exclude<SalesIntent, "UNKNOWN"> {
  return intent !== "UNKNOWN";
}
