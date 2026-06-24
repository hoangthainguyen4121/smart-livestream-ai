import type { PredictIntentApiResponse } from "../../api/nlpIntent";
import type { IntentClassification } from "./intentClassifier";
import type { SalesNlpAction, SalesNlpIntent } from "./salesNlpTypes";

export const ML_INTENT_CONFIDENCE_THRESHOLD = 0.5;

const COLOR_TOKENS =
  "xanh|den|do|vang|trang|tim|hong|xam|nau|be|ruby|cam|xanh la|xanh duong";

const COMMERCE_SIGNAL_PATTERN = new RegExp(
  [
    "\\bgia\\b",
    "\\bbao nhieu\\b",
    "\\bhang\\b",
    "\\bton\\b",
    "\\blink\\b",
    "\\bship\\b",
    "\\bmua\\b",
    "\\bchot\\b",
    "\\bkinh\\b",
    "\\bson\\b",
    "\\bmau\\b",
    "\\bsize\\b",
    "\\bco mau\\b",
    "\\bcon mau\\b",
    `\\b(${COLOR_TOKENS})\\b`,
    "\\bsan pham\\b",
    "\\bsp\\b",
  ].join("|"),
);

export type IntentSource = "ml" | "regex" | "regex_fallback";

export type MlIntentBridge = {
  mlAvailable: boolean;
  mlIntent: string | null;
  mlConfidence: number;
  mappedIntent: SalesNlpIntent;
  mappedAction: SalesNlpAction;
  suppressEvent: boolean;
  isComplaintEscalation: boolean;
  isSpamModeration: boolean;
  usedMl: boolean;
  intentSource: IntentSource;
};

export type ChatMlIntentBadge = {
  label: string;
  confidence: number | null;
  intentSource: IntentSource;
  mappedIntent: SalesNlpIntent | null;
};

const ML_INTENT_MAP: Record<string, { intent: SalesNlpIntent; action: SalesNlpAction }> = {
  ASK_PRICE: { intent: "ASK_PRICE", action: "AUTO_REPLY_SUGGESTED" },
  ASK_VARIANT: { intent: "ASK_SIZE", action: "AUTO_REPLY_SUGGESTED" },
  ASK_STOCK: { intent: "ASK_STOCK", action: "AUTO_REPLY_SUGGESTED" },
  ASK_LINK: { intent: "ASK_LINK", action: "AUTO_REPLY_SUGGESTED" },
  ASK_SHIPPING: { intent: "ASK_SHIPPING", action: "AUTO_REPLY_SUGGESTED" },
  ASK_PROMOTION: { intent: "ASK_PROMOTION", action: "AUTO_REPLY_SUGGESTED" },
  PRODUCT_INFO: { intent: "ASK_PRODUCT_INFO", action: "AUTO_REPLY_SUGGESTED" },
  PURCHASE_INTENT: { intent: "PURCHASE_INTENT", action: "ESCALATE_TO_HOST" },
};

function getMlConfidenceThreshold(mlIntent: string): number {
  switch (mlIntent.trim().toUpperCase()) {
    case "PRODUCT_INFO":
      return 0.7;
    case "CHITCHAT":
    case "SPAM_TOXIC":
      return 0.45;
    default:
      return ML_INTENT_CONFIDENCE_THRESHOLD;
  }
}

export function hasCommerceProductSignal(normalizedComment: string): boolean {
  return COMMERCE_SIGNAL_PATTERN.test(normalizedComment);
}

export function mapMlIntentLabel(mlIntent: string): {
  mappedIntent: SalesNlpIntent;
  mappedAction: SalesNlpAction;
  suppressEvent: boolean;
  isComplaintEscalation: boolean;
  isSpamModeration: boolean;
} {
  const normalized = mlIntent.trim().toUpperCase();

  if (normalized === "CHITCHAT") {
    return {
      mappedIntent: "UNKNOWN",
      mappedAction: "IGNORE",
      suppressEvent: true,
      isComplaintEscalation: false,
      isSpamModeration: false,
    };
  }

  if (normalized === "SPAM_TOXIC") {
    return {
      mappedIntent: "UNKNOWN",
      mappedAction: "IGNORE",
      suppressEvent: true,
      isComplaintEscalation: false,
      isSpamModeration: true,
    };
  }

  if (normalized === "COMPLAINT") {
    return {
      mappedIntent: "ASK_PRODUCT_INFO",
      mappedAction: "ESCALATE_TO_HOST",
      suppressEvent: false,
      isComplaintEscalation: true,
      isSpamModeration: false,
    };
  }

  const mapped = ML_INTENT_MAP[normalized];
  if (!mapped) {
    return {
      mappedIntent: "UNKNOWN",
      mappedAction: "IGNORE",
      suppressEvent: true,
      isComplaintEscalation: false,
      isSpamModeration: false,
    };
  }

  return {
    mappedIntent: mapped.intent,
    mappedAction: mapped.action,
    suppressEvent: false,
    isComplaintEscalation: false,
    isSpamModeration: false,
  };
}

function shouldUseMlIntent(
  mlIntent: string,
  mlConfidence: number,
  mappedIntent: SalesNlpIntent,
  regexClassification: IntentClassification,
  normalizedComment: string,
): boolean {
  const normalizedMlIntent = mlIntent.trim().toUpperCase();
  const threshold = getMlConfidenceThreshold(normalizedMlIntent);

  if (mlConfidence >= threshold) {
    if (
      normalizedMlIntent === "PRODUCT_INFO" &&
      regexClassification.intent === "UNKNOWN" &&
      !hasCommerceProductSignal(normalizedComment)
    ) {
      return false;
    }
    return true;
  }

  if (
    normalizedMlIntent === "CHITCHAT" ||
    normalizedMlIntent === "SPAM_TOXIC" ||
    normalizedMlIntent === "COMPLAINT"
  ) {
    return mlConfidence >= threshold;
  }

  if (
    mlConfidence >= 0.4 &&
    regexClassification.intent !== "UNKNOWN" &&
    mappedIntent === regexClassification.intent
  ) {
    return true;
  }

  return false;
}

export function buildMlIntentBridge(
  response: PredictIntentApiResponse,
  regexClassification: IntentClassification,
  normalizedComment: string,
): MlIntentBridge {
  if (!response.ml_available || !response.intent) {
    return {
      mlAvailable: false,
      mlIntent: null,
      mlConfidence: 0,
      mappedIntent: "UNKNOWN",
      mappedAction: "IGNORE",
      suppressEvent: false,
      isComplaintEscalation: false,
      isSpamModeration: false,
      usedMl: false,
      intentSource: "regex_fallback",
    };
  }

  const mappedIntent = (response.mapped_intent as SalesNlpIntent | null) ?? "UNKNOWN";
  const mappedAction = (response.mapped_action as SalesNlpAction | null) ?? "IGNORE";
  const usedMl = shouldUseMlIntent(
    response.intent,
    response.confidence,
    mappedIntent,
    regexClassification,
    normalizedComment,
  );

  return {
    mlAvailable: true,
    mlIntent: response.intent,
    mlConfidence: response.confidence,
    mappedIntent,
    mappedAction,
    suppressEvent: response.suppress_event,
    isComplaintEscalation: response.is_complaint_escalation,
    isSpamModeration: response.is_spam_moderation,
    usedMl,
    intentSource: usedMl ? "ml" : "regex_fallback",
  };
}

export function buildChatMlIntentBadge(
  bridge: MlIntentBridge,
  regexIntent: SalesNlpIntent,
): ChatMlIntentBadge {
  if (bridge.usedMl && bridge.mlIntent) {
    return {
      label: bridge.mlIntent,
      confidence: bridge.mlConfidence,
      intentSource: "ml",
      mappedIntent: bridge.mappedIntent,
    };
  }

  if (bridge.mlAvailable && !bridge.usedMl) {
    return {
      label: bridge.mlIntent ?? "ML low confidence",
      confidence: bridge.mlConfidence,
      intentSource: "regex_fallback",
      mappedIntent: regexIntent,
    };
  }

  return {
    label: regexIntent,
    confidence: null,
    intentSource: bridge.intentSource === "regex_fallback" ? "regex_fallback" : "regex",
    mappedIntent: regexIntent,
  };
}
