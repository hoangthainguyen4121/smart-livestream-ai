import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import type { ProductResolution, ProductResolutionSource } from "./productMentionResolver";
import type { ProductSearchDiagnostics } from "../product-search/productSearchTypes";
import type { IntentSource, MlIntentBridge } from "./mlIntentBridge";

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
  pinnedProduct: CatalogProduct;
  catalog: CatalogProduct[];
  autoReplyInChat?: boolean;
  mlBridge?: MlIntentBridge | null;
};

export type SalesNlpPipelineResult = {
  normalizedText: string;
  intent: SalesNlpIntent;
  confidence: number;
  matchedPatterns: string[];
  action: SalesNlpAction;
  resolvedProduct: CatalogProduct;
  productResolution: ProductResolution;
  resolutionSource: ProductResolutionSource;
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
};

export function isRecognizedNlpIntent(
  intent: SalesNlpIntent,
): intent is Exclude<SalesNlpIntent, "UNKNOWN"> {
  return intent !== "UNKNOWN";
}
