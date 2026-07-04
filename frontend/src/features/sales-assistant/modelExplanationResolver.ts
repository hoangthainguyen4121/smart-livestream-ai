import type { PredictIntentApiResponse } from "../../api/nlpIntent";
import type { MlIntentBridge } from "../sales-nlp/mlIntentBridge";
import limeLookup from "../../data/limeExplanationLookup.json";
import type { ModelExplanation } from "./salesAssistantTypes";

type LookupEntry = {
  predictedLabel: string;
  confidence: number;
  topLabels: Array<{ label: string; confidence: number }>;
  positiveFeatures: Array<{ token: string; weight: number }>;
  negativeFeatures: Array<{ token: string; weight: number }>;
};

const LOOKUP = limeLookup as Record<string, LookupEntry>;

function fromLookup(comment: string, normalizedText: string): ModelExplanation | null {
  const entry = LOOKUP[comment.trim()] ?? LOOKUP[normalizedText.trim()];
  if (!entry) {
    return null;
  }

  return {
    predictedLabel: entry.predictedLabel,
    confidence: entry.confidence,
    topLabels: entry.topLabels,
    positiveFeatures: entry.positiveFeatures,
    negativeFeatures: entry.negativeFeatures,
    source: "lime_lookup",
  };
}

function fromMlBridge(mlBridge: MlIntentBridge | null | undefined): ModelExplanation | null {
  if (!mlBridge?.mlAvailable || !mlBridge.mlIntent) {
    return null;
  }

  return {
    predictedLabel: mlBridge.mlIntent,
    confidence: mlBridge.mlConfidence,
    topLabels: [
      {
        label: mlBridge.mlIntent,
        confidence: mlBridge.mlConfidence,
      },
    ],
    positiveFeatures: [],
    negativeFeatures: [],
    source: "ml_bridge",
  };
}

function fromMlResponse(mlResponse: PredictIntentApiResponse | null | undefined): ModelExplanation | null {
  if (!mlResponse?.ml_available || !mlResponse.intent) {
    return null;
  }

  return {
    predictedLabel: mlResponse.intent,
    confidence: mlResponse.confidence,
    topLabels: mlResponse.top_k.map((item) => ({
      label: item.intent,
      confidence: item.confidence,
    })),
    positiveFeatures: [],
    negativeFeatures: [],
    source: "ml_bridge",
  };
}

export function resolveModelExplanation(input: {
  comment: string;
  normalizedText: string;
  mlBridge?: MlIntentBridge | null;
  mlResponse?: PredictIntentApiResponse | null;
}): ModelExplanation | null {
  const lookup = fromLookup(input.comment, input.normalizedText);
  if (lookup) {
    return lookup;
  }

  if (input.mlResponse) {
    return fromMlResponse(input.mlResponse);
  }

  return fromMlBridge(input.mlBridge);
}

export function hasLimeTokenBars(explanation: ModelExplanation | null | undefined): boolean {
  if (!explanation) {
    return false;
  }
  return explanation.positiveFeatures.length > 0 || explanation.negativeFeatures.length > 0;
}
