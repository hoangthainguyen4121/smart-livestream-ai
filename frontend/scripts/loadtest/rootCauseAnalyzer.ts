import type { SalesNlpExplanation } from "../../src/features/sales-nlp/salesNlpTypes";
import type { HardCaseExpectation } from "./hardCases";

export type RootCause =
  | "NORMALIZATION_GAP"
  | "MISSING_SYNONYM"
  | "REGEX_PRIORITY"
  | "MULTI_INTENT_AMBIGUITY"
  | "PRODUCT_AMBIGUITY"
  | "CONTEXT_AMBIGUITY"
  | "CATALOG_MATCH_GAP"
  | "EXPECTATION_TOO_STRICT"
  | "ML_REQUIRED"
  | "UNKNOWN";

export type CaseSeverity = "high" | "medium" | "low";

export type AnalyzedCase = {
  rootCause: RootCause;
  suggestedFix: string;
  severity: CaseSeverity;
};

const SLANG_MARKERS =
  /\b(con k|con ko|con hong|bn shop|ib gia|nhiu tien|nhiu z|freeship k|dc k|còn k|còn hông)\b/i;

const MULTI_INTENT_MARKERS: Array<{ intent: string; pattern: RegExp }> = [
  { intent: "ASK_PRICE", pattern: /\b(gia|bao nhieu|bn)\b/ },
  { intent: "ASK_STOCK", pattern: /\b(con hang|con khong|het hang)\b/ },
  { intent: "ASK_COLOR", pattern: /\b(mau|mau den|mau do|con mau)\b/ },
  { intent: "ASK_SHIPPING", pattern: /\b(ship|giao hang|van chuyen)\b/ },
  { intent: "ASK_SIZE", pattern: /\bsize\b/ },
  { intent: "PURCHASE_INTENT", pattern: /\b(chot|lay \d+|dat hang)\b/ },
];

function detectMultiIntentSignals(normalizedText: string): string[] {
  return MULTI_INTENT_MARKERS.filter(({ pattern }) => pattern.test(normalizedText)).map(
    ({ intent }) => intent,
  );
}

function hasCloseProductCandidates(explanation: SalesNlpExplanation): boolean {
  if (explanation.productCandidates.length < 2) {
    return false;
  }
  const [first, second] = explanation.productCandidates;
  return Math.abs(first.score - second.score) <= 1;
}

function inferSeverity(rootCause: RootCause, status: "FAIL" | "WARN" | "SKIP"): CaseSeverity {
  if (rootCause === "ML_REQUIRED") {
    return "medium";
  }
  if (rootCause === "EXPECTATION_TOO_STRICT") {
    return "low";
  }
  if (status === "WARN") {
    return "medium";
  }
  if (rootCause === "NORMALIZATION_GAP" || rootCause === "REGEX_PRIORITY") {
    return "high";
  }
  return status === "FAIL" ? "high" : "medium";
}

function buildSuggestedFix(rootCause: RootCause, context: {
  comment: string;
  expectedIntent?: string;
  actualIntent: string;
  normalizedText: string;
  messages: string[];
}): string {
  switch (rootCause) {
    case "NORMALIZATION_GAP":
      return `Add slang normalization in normalizeText.ts for "${context.comment}" (normalized: "${context.normalizedText}")`;
    case "MISSING_SYNONYM":
      return `Add intent synonym/pattern for expected ${context.expectedIntent ?? "intent"}; normalized="${context.normalizedText}"`;
    case "REGEX_PRIORITY":
      return `Adjust INTENT_RULES order or guard: expected ${context.expectedIntent} but got ${context.actualIntent} for "${context.comment}"`;
    case "MULTI_INTENT_AMBIGUITY":
      return "Document first dominant intent expectation or add multi-intent disambiguation (first clause wins)";
    case "PRODUCT_AMBIGUITY":
      return "Add clarification when top product candidates are too close in score";
    case "CONTEXT_AMBIGUITY":
      return "Review ProductContextResolver inputs or clarify expected context source for deictic phrase";
    case "CATALOG_MATCH_GAP":
      return "Improve catalog tags/aliases or mention resolver for explicit product phrase";
    case "EXPECTATION_TOO_STRICT":
      return "Relax test expectation or mark allowAmbiguous for near-duplicate catalog products";
    case "ML_REQUIRED":
      return "Add this sample to training/evaluation set for Repo B (complaint/spam/toxic ML)";
    case "UNKNOWN":
    default:
      return context.messages[0] ?? "Review case manually; no automatic fix heuristic matched";
  }
}

export function analyzeCase(input: {
  status: "PASS" | "FAIL" | "WARN" | "SKIP";
  comment: string;
  messages: string[];
  explanation: SalesNlpExplanation;
  expect?: HardCaseExpectation;
  sourceGroup: string;
  isDeterministic: boolean;
}): AnalyzedCase | null {
  const { status, comment, messages, explanation, expect } = input;

  if (status === "PASS") {
    return null;
  }

  if (status === "SKIP" || expect?.requiresMl) {
    return {
      rootCause: "ML_REQUIRED",
      suggestedFix: buildSuggestedFix("ML_REQUIRED", {
        comment,
        actualIntent: explanation.intent,
        normalizedText: explanation.normalizedText,
        messages,
      }),
      severity: "medium",
    };
  }

  let rootCause: RootCause = "UNKNOWN";

  if (messages.some((message) => message.includes("ambiguous product mention"))) {
    rootCause = "PRODUCT_AMBIGUITY";
  } else if (expect?.intent && explanation.intent === "UNKNOWN") {
    rootCause =
      SLANG_MARKERS.test(comment) || SLANG_MARKERS.test(explanation.normalizedText)
        ? "NORMALIZATION_GAP"
        : "MISSING_SYNONYM";
  } else if (expect?.intent && explanation.intent !== expect.intent) {
    const multiSignals = detectMultiIntentSignals(explanation.normalizedText);
    if (multiSignals.length >= 2) {
      rootCause = "MULTI_INTENT_AMBIGUITY";
    } else if (
      (expect.intent === "ASK_STOCK" &&
        (explanation.intent === "ASK_COLOR" || explanation.intent === "ASK_SIZE")) ||
      (expect.intent === "ASK_COLOR" && explanation.intent === "ASK_SHIPPING")
    ) {
      rootCause = "REGEX_PRIORITY";
    } else if (explanation.intentReason.includes("No intent keywords")) {
      rootCause = "NORMALIZATION_GAP";
    } else {
      rootCause = "REGEX_PRIORITY";
    }
  } else if (expect?.contextSource && explanation.contextSource !== expect.contextSource) {
    rootCause = "CONTEXT_AMBIGUITY";
  } else if (expect?.productId && explanation.resolvedProductId !== expect.productId) {
    rootCause = hasCloseProductCandidates(explanation) ? "PRODUCT_AMBIGUITY" : "CATALOG_MATCH_GAP";
  } else if (expect?.allowAmbiguous && hasCloseProductCandidates(explanation)) {
    rootCause = "PRODUCT_AMBIGUITY";
  } else if (status === "WARN" && explanation.isClarification) {
    rootCause = "CONTEXT_AMBIGUITY";
  }

  if (rootCause === "UNKNOWN" && expect?.allowAmbiguous) {
    rootCause = "EXPECTATION_TOO_STRICT";
  }

  const suggestedFix = buildSuggestedFix(rootCause, {
    comment,
    expectedIntent: expect?.intent,
    actualIntent: explanation.intent,
    normalizedText: explanation.normalizedText,
    messages,
  });

  return {
    rootCause,
    suggestedFix,
    severity: inferSeverity(rootCause, status === "SKIP" ? "SKIP" : status),
  };
}

export function analyzeSuspiciousRandomCase(input: {
  comment: string;
  explanation: SalesNlpExplanation;
  sourceGroup: string;
}): AnalyzedCase | null {
  const { comment, explanation } = input;

  if (explanation.intent !== "UNKNOWN" && explanation.confidence >= 0.75) {
    return null;
  }

  const multiSignals = detectMultiIntentSignals(explanation.normalizedText);
  const looksLikeSlang = SLANG_MARKERS.test(comment);
  const lowConfidence = explanation.confidence > 0 && explanation.confidence < 0.6;
  const unknownButStructured =
    explanation.intent === "UNKNOWN" && multiSignals.length > 0;

  if (!looksLikeSlang && !lowConfidence && !unknownButStructured && !explanation.isClarification) {
    return null;
  }

  let rootCause: RootCause = "UNKNOWN";
  if (looksLikeSlang && explanation.intent === "UNKNOWN") {
    rootCause = "NORMALIZATION_GAP";
  } else if (multiSignals.length >= 2) {
    rootCause = "MULTI_INTENT_AMBIGUITY";
  } else if (hasCloseProductCandidates(explanation)) {
    rootCause = "PRODUCT_AMBIGUITY";
  } else if (lowConfidence) {
    rootCause = "MISSING_SYNONYM";
  }

  return {
    rootCause,
    suggestedFix: buildSuggestedFix(rootCause, {
      comment,
      actualIntent: explanation.intent,
      normalizedText: explanation.normalizedText,
      messages: [],
    }),
    severity: "low",
  };
}
