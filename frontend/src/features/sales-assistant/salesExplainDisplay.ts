import type { Locale, TranslationKey } from "../../i18n/translations";
import type { ExplainableContextSource } from "../sales-nlp/salesNlpTypes";
import type { SalesNlpExplanation } from "../sales-nlp/salesNlpTypes";
import { formatIntentLabel } from "../sales-nlp/formatChatIntentLabel";
import type { SalesAssistantEvent } from "./salesAssistantTypes";
import { getActionDisplayLabel, getIntentDisplayLabel } from "./salesAssistantLabels";

export function needsProductClarification(event: SalesAssistantEvent): boolean {
  return (
    event.contextSource === "clarification" ||
    event.explanation.isClarification ||
    event.explanation.contextSource === "clarification"
  );
}

export function getDisplayResolvedProduct(
  event: SalesAssistantEvent,
  t: (key: TranslationKey) => string,
): string {
  if (needsProductClarification(event)) {
    return t("explainProductUnresolved");
  }
  return event.resolvedProductName;
}

const EXPLAINABLE_CONTEXT_VI: Record<ExplainableContextSource, string> = {
  explicit_catalog_match: "Khớp trực tiếp với danh mục sản phẩm",
  catalog_candidate: "Ứng viên danh mục sản phẩm",
  pinned_product: "Sản phẩm đang ghim",
  manual_camera_context: "Ngữ cảnh camera thủ công",
  camera_vision: "Nhận diện camera thử nghiệm",
  clarification: "Cần hỏi rõ sản phẩm",
};

const EXPLAINABLE_CONTEXT_EN: Record<ExplainableContextSource, string> = {
  explicit_catalog_match: "Direct catalog match",
  catalog_candidate: "Catalog candidate",
  pinned_product: "Pinned product",
  manual_camera_context: "Manual camera context",
  camera_vision: "Experimental camera recognition",
  clarification: "Needs product clarification",
};

export function getExplainableContextDisplayLabel(
  source: ExplainableContextSource,
  locale: Locale = "vi",
): string {
  return locale === "vi" ? EXPLAINABLE_CONTEXT_VI[source] : EXPLAINABLE_CONTEXT_EN[source];
}

export function buildPredictionInterpretation(
  explanation: SalesNlpExplanation,
  mlConfidence: number | null,
  locale: Locale,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  const mlLabel = explanation.mlRawIntent?.trim();
  if (mlLabel && (explanation.intentSource === "ml" || mlConfidence !== null)) {
    const confidence = ((mlConfidence ?? explanation.confidence) * 100).toFixed(0);
    return t("explainPhobertPredictionSentence", {
      label: formatIntentLabel(mlLabel, t),
      confidence,
    });
  }

  if (explanation.regexMatchedPatterns.length > 0) {
    return t("explainRegexPredictionSentence", {
      patterns: explanation.regexMatchedPatterns.join(", "),
      intent: getIntentDisplayLabel(explanation.intent, locale),
    });
  }

  if (explanation.intentReason.toLowerCase().includes("phobert mapped")) {
    return t("explainPhobertPredictionSentence", {
      label: getIntentDisplayLabel(explanation.intent, locale),
      confidence: (explanation.confidence * 100).toFixed(0),
    });
  }

  return explanation.intentReason;
}

export function getClarificationQuestion(event: SalesAssistantEvent): string | null {
  if (!needsProductClarification(event)) {
    return null;
  }
  if (event.explanation.reply && event.explanation.isClarification) {
    return event.explanation.reply;
  }
  return event.suggestedReply || null;
}

export type DecisionTimelineStep = {
  key: string;
  label: string;
  detail: string;
};

export function buildDecisionTimeline(
  event: SalesAssistantEvent,
  locale: Locale,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): DecisionTimelineStep[] {
  const intentLabel = getIntentDisplayLabel(event.intent, locale);
  const contextLabel = getExplainableContextDisplayLabel(event.explanation.contextSource, locale);
  const productLabel = getDisplayResolvedProduct(event, t);
  const actionLabel = getActionDisplayLabel(event.action, locale);

  return [
    {
      key: "comment",
      label: t("explainTimelineComment"),
      detail: `"${event.viewerComment}"`,
    },
    {
      key: "intent",
      label: t("explainTimelineIntent"),
      detail: event.modelExplanation
        ? `${formatIntentLabel(event.modelExplanation.predictedLabel, t)} (${(event.modelExplanation.confidence * 100).toFixed(0)}%)`
        : `${intentLabel} (${(event.confidence * 100).toFixed(0)}%)`,
    },
    {
      key: "context",
      label: t("explainTimelineContext"),
      detail: `${contextLabel} · ${productLabel}`,
    },
    {
      key: "action",
      label: t("explainTimelineAction"),
      detail: actionLabel,
    },
    {
      key: "reply",
      label: t("explainTimelineReply"),
      detail: event.suggestedReply,
    },
  ];
}
