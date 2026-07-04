import type { PredictIntentApiResponse } from "../../api/nlpIntent";
import type { IntentClassification } from "./intentClassifier";
import { resolveMlVariantIntent } from "./intentSignals";
import type { SalesNlpAction, SalesNlpIntent } from "./salesNlpTypes";

export const ML_INTENT_CONFIDENCE_THRESHOLD = 0.5;

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
      return 0.55;
    case "CHITCHAT":
    case "SPAM_TOXIC":
      return 0.45;
    case "PURCHASE_INTENT":
      return 0.5;
    case "COMPLAINT":
      return 0.4;
    default:
      return ML_INTENT_CONFIDENCE_THRESHOLD;
  }
}

export function mapMlIntentLabel(
  mlIntent: string,
  normalizedComment = "",
): {
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

  if (normalized === "ASK_VARIANT") {
    const variantIntent = resolveMlVariantIntent(normalizedComment);
    return {
      mappedIntent: variantIntent,
      mappedAction: "AUTO_REPLY_SUGGESTED",
      suppressEvent: false,
      isComplaintEscalation: false,
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
): boolean {
  const normalizedMlIntent = mlIntent.trim().toUpperCase();
  const threshold = getMlConfidenceThreshold(normalizedMlIntent);

  if (mlConfidence >= threshold) {
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

  const mapped = mapMlIntentLabel(response.intent, normalizedComment);
  const usedMl = shouldUseMlIntent(
    response.intent,
    response.confidence,
    mapped.mappedIntent,
    regexClassification,
  );

  return {
    mlAvailable: true,
    mlIntent: response.intent,
    mlConfidence: response.confidence,
    mappedIntent: mapped.mappedIntent,
    mappedAction: mapped.mappedAction,
    suppressEvent: mapped.suppressEvent,
    isComplaintEscalation: mapped.isComplaintEscalation,
    isSpamModeration: mapped.isSpamModeration,
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
