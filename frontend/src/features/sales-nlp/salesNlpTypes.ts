import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import type { ProductResolution, ProductResolutionSource } from "./productMentionResolver";
import type { ProductSearchDiagnostics } from "../product-search/productSearchTypes";
import type { IntentSource, MlIntentBridge } from "./mlIntentBridge";
import type { CommerceSuggestedAction } from "../commerce/commerceTypes";

export type ProductContextSource =
  | "camera_vision"
  | "camera_context"
  | "pinned_product"
  | "catalog_match"
  | "clarification";

export type SalesNlpIntent =
  | "ASK_PRICE"
  | "ASK_STOCK"
  | "ASK_COLOR"
  | "ASK_SIZE"
  | "ASK_LINK"
  | "ASK_SHIPPING"
  | "ASK_PROMOTION"
  | "ASK_PRODUCT_INFO"
  | "COMPARE_PRODUCTS"
  | "PURCHASE_INTENT"
  | "UNKNOWN";

export type SalesNlpAction =
  | "AUTO_REPLY_SUGGESTED"
  | "INBOX_SUGGESTED"
  | "ESCALATE_TO_HOST"
  | "IGNORE";

export type ExtractedEntities = {
  colors: string[];
  sizes: string[];
  quantity: number | null;
  productKeywords: string[];
  shippingLocation: string | null;
  mentionedProductIds: string[];
};

export type SalesNlpPipelineInput = {
  comment: string;
  pinnedProduct: CatalogProduct | null;
  catalog: CatalogProduct[];
  selectedCameraProductId?: string | null;
  latestCameraProductId?: string | null;
  detectedCameraProductId?: string | null;
  detectedCameraConfidence?: number | null;
  autoReplyInChat?: boolean;
  mlBridge?: MlIntentBridge | null;
};

export type SalesNlpPipelineResult = {
  normalizedText: string;
  intent: SalesNlpIntent;
  confidence: number;
  matchedPatterns: string[];
  action: SalesNlpAction;
  resolvedProduct: CatalogProduct | null;
  productResolution: ProductResolution;
  resolutionSource: ProductResolutionSource;
  contextSource: ProductContextSource;
  contextExplanation: string;
  matchedProducts: CatalogProduct[];
  selectedProductId: string;
  productConfidence: number;
  semanticSimilarity: number | null;
  searchDiagnostics: ProductSearchDiagnostics | null;
  comparedProducts: CatalogProduct[];
  entities: ExtractedEntities;
  suggestedReply: string;
  shouldReplyInChat: boolean;
  mlBridge: MlIntentBridge | null;
  mlRawIntent: string | null;
  mlConfidence: number | null;
  intentSource: IntentSource;
  suppressEvent: boolean;
  isComplaintEscalation: boolean;
  isSpamModeration: boolean;
  commerceActions: CommerceSuggestedAction[];
  explanation: SalesNlpExplanation;
};

export type ExplainableContextSource =
  | "explicit_catalog_match"
  | "manual_camera_context"
  | "pinned_product"
  | "camera_vision"
  | "catalog_candidate"
  | "clarification";

export type SalesNlpProductCandidate = {
  id: string;
  name: string;
  score: number;
  matchedTerms: string[];
};

export type SalesNlpExplanation = {
  comment: string;
  normalizedText: string;
  intent: SalesNlpIntent;
  intentReason: string;
  regexIntent: SalesNlpIntent;
  regexMatchedPatterns: string[];
  intentSource: IntentSource;
  mlRawIntent: string | null;
  confidence: number;
  resolvedProductId: string;
  resolvedProductName: string;
  contextSource: ExplainableContextSource;
  contextReason: string;
  productCandidates: SalesNlpProductCandidate[];
  action: SalesNlpAction;
  actionReason: string;
  reply: string;
  replyReason: string;
  suppressEvent: boolean;
  isClarification: boolean;
};

export function isRecognizedNlpIntent(
  intent: SalesNlpIntent,
): intent is Exclude<SalesNlpIntent, "UNKNOWN"> {
  return intent !== "UNKNOWN";
}
