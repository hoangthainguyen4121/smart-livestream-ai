import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import type { IntentClassification } from "./intentClassifier";
import { rankProductMentions } from "./productMentionResolver";
import type { ProductContextResolution } from "./productContextResolver";
import type { ProductResolution } from "./productMentionResolver";
import type { IntentSource, MlIntentBridge } from "./mlIntentBridge";
import type {
  ExplainableContextSource,
  SalesNlpAction,
  SalesNlpExplanation,
  SalesNlpIntent,
} from "./salesNlpTypes";

type BuildExplanationInput = {
  comment: string;
  normalizedText: string;
  regexClassification: IntentClassification;
  mlApplied: {
    classification: IntentClassification;
    actionOverride: SalesNlpAction | null;
    intentSource: IntentSource;
    suppressEvent: boolean;
    isComplaintEscalation: boolean;
    isSpamModeration: boolean;
    suggestedReplyOverride: string | null;
  };
  mlBridge: MlIntentBridge | null | undefined;
  contextResolution: ProductContextResolution;
  productResolution: ProductResolution;
  catalog: CatalogProduct[];
  intent: SalesNlpIntent;
  confidence: number;
  action: SalesNlpAction;
  suggestedReply: string;
  autoReplyInChat: boolean;
};

export function mapExplainableContextSource(
  contextResolution: ProductContextResolution,
): ExplainableContextSource {
  if (contextResolution.source === "camera_context") {
    return "manual_camera_context";
  }
  if (contextResolution.source === "camera_vision") {
    return "camera_vision";
  }
  if (contextResolution.source === "pinned_product") {
    return "pinned_product";
  }
  if (contextResolution.source === "clarification") {
    return "clarification";
  }

  if (contextResolution.explanation.startsWith("Explicit catalog match")) {
    return "explicit_catalog_match";
  }

  return "catalog_candidate";
}

function buildIntentReason(
  regexClassification: IntentClassification,
  finalIntent: SalesNlpIntent,
  intentSource: IntentSource,
  mlBridge: MlIntentBridge | null | undefined,
  matchedPatterns: string[],
): string {
  if (intentSource === "ml" && mlBridge?.usedMl) {
    const mlLabel = mlBridge.mlIntent ?? "unknown";
    if (regexClassification.intent !== "UNKNOWN" && regexClassification.intent !== finalIntent) {
      return `PhoBERT mapped "${mlLabel}" (${(mlBridge.mlConfidence * 100).toFixed(0)}%) overriding regex ${regexClassification.intent}`;
    }
    return `PhoBERT mapped intent "${mlLabel}" with confidence ${(mlBridge.mlConfidence * 100).toFixed(0)}%`;
  }

  if (intentSource === "regex_fallback") {
    if (regexClassification.matchedPatterns.length > 0) {
      return `Rules fallback kept regex intent ${regexClassification.intent}; matched: ${regexClassification.matchedPatterns.join(", ")}`;
    }
    return "Rules fallback; no confident regex intent match";
  }

  if (regexClassification.matchedPatterns.length > 0) {
    return `Regex matched ${regexClassification.intent}; keywords: ${regexClassification.matchedPatterns.join(", ")}`;
  }

  if (finalIntent !== "UNKNOWN") {
    const inferred = matchedPatterns.filter(
      (pattern) =>
        ![
          "catalog_match",
          "pinned_product",
          "camera_context",
          "camera_vision",
          "clarification",
        ].includes(pattern),
    );
    if (inferred.length > 0) {
      return `Intent inferred from product context; signals: ${inferred.join(", ")}`;
    }
    return `Intent inferred as ${finalIntent} from product context`;
  }

  return "No intent keywords matched";
}

function buildActionReason(
  action: SalesNlpAction,
  intent: SalesNlpIntent,
  autoReplyInChat: boolean,
  mlApplied: BuildExplanationInput["mlApplied"],
  isClarification: boolean,
): string {
  if (mlApplied.isSpamModeration) {
    return "ML flagged spam/noise; action suppressed";
  }
  if (mlApplied.isComplaintEscalation) {
    return "Complaint escalation routed to host with apology template";
  }
  if (mlApplied.actionOverride) {
    return `ML override selected action ${action}`;
  }
  if (action === "IGNORE") {
    return intent === "UNKNOWN" ? "Unknown intent; no host action" : "Intent ignored by policy";
  }
  if (action === "ESCALATE_TO_HOST") {
    return "Purchase intent requires host follow-up";
  }
  if (isClarification) {
    return "Product context unclear; ask viewer to clarify before commerce action";
  }
  if (action === "AUTO_REPLY_SUGGESTED") {
    return autoReplyInChat
      ? `${intent} with resolvable product context allows chat auto reply`
      : "Auto reply disabled; would suggest inbox reply";
  }
  return "Suggest host reply via inbox";
}

function buildReplyReason(
  suggestedReply: string,
  intent: SalesNlpIntent,
  isClarification: boolean,
  mlApplied: BuildExplanationInput["mlApplied"],
  productResolution: ProductResolution,
): string {
  if (!suggestedReply) {
    return "No reply generated";
  }
  if (mlApplied.suggestedReplyOverride) {
    return "Complaint template reply from ML bridge";
  }
  if (isClarification) {
    return "Clarification question because product context is ambiguous or missing";
  }
  if (productResolution.isAmbiguous && productResolution.clarificationQuestion) {
    return "Ambiguous catalog match; clarification question selected";
  }
  if (intent === "ASK_PRICE") {
    return "Price question + resolved product has price";
  }
  if (intent === "ASK_STOCK") {
    return "Stock question + resolved product stock available";
  }
  if (intent === "ASK_LINK") {
    return "Link request + resolved product URL available";
  }
  if (intent === "ASK_COLOR" || intent === "ASK_SIZE") {
    return "Variant question answered from product attributes";
  }
  if (intent === "PURCHASE_INTENT") {
    return "Purchase intent escalated; optional acknowledgement only";
  }
  return `Template answer generated for ${intent}`;
}

export function buildSalesNlpExplanation(input: BuildExplanationInput): SalesNlpExplanation {
  const explainableContextSource = mapExplainableContextSource(input.contextResolution);
  const ranked = rankProductMentions(input.comment, input.catalog, 5);

  return {
    comment: input.comment,
    normalizedText: input.normalizedText,
    intent: input.intent,
    intentReason: buildIntentReason(
      input.regexClassification,
      input.intent,
      input.mlApplied.intentSource,
      input.mlBridge,
      input.mlApplied.classification.matchedPatterns,
    ),
    regexIntent: input.regexClassification.intent,
    regexMatchedPatterns: input.regexClassification.matchedPatterns,
    intentSource: input.mlApplied.intentSource,
    mlRawIntent: input.mlBridge?.mlIntent ?? null,
    confidence: input.confidence,
    resolvedProductId: input.productResolution.selectedProductId,
    resolvedProductName: input.productResolution.selectedProduct?.name ?? "",
    contextSource: explainableContextSource,
    contextReason: input.contextResolution.explanation,
    productCandidates: ranked.map((entry) => ({
      id: entry.product.id,
      name: entry.product.name,
      score: entry.score,
      matchedTerms: entry.matchedTerms,
    })),
    action: input.action,
    actionReason: buildActionReason(
      input.action,
      input.intent,
      input.autoReplyInChat,
      input.mlApplied,
      input.contextResolution.isClarification,
    ),
    reply: input.suggestedReply,
    replyReason: buildReplyReason(
      input.suggestedReply,
      input.intent,
      input.contextResolution.isClarification,
      input.mlApplied,
      input.productResolution,
    ),
    suppressEvent: input.mlApplied.suppressEvent,
    isClarification: input.contextResolution.isClarification,
  };
}
