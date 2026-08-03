import type { PredictIntentApiResponse } from "../../api/nlpIntent";
import type { CommentCorrectionContext } from "./intentCorrectionTypes";

export function buildCommentCorrectionContext(
  message: {
    id: string;
    room_id: string;
    author: string;
    text: string;
    created_at: string;
  },
  mlResponse: PredictIntentApiResponse | null | undefined,
): CommentCorrectionContext | null {
  if (!mlResponse?.ml_available || !mlResponse.intent) {
    return null;
  }
  if (!mlResponse.model_id || !mlResponse.model_version) {
    return null;
  }

  return {
    sourceCommentId: message.id,
    roomId: message.room_id,
    text: message.text,
    authorDisplayName: message.author,
    createdAt: message.created_at,
    predictedIntent: mlResponse.intent.trim().toUpperCase(),
    predictionConfidence: mlResponse.confidence,
    modelId: mlResponse.model_id,
    modelVersion: mlResponse.model_version,
  };
}

export function buildIntentCorrectionPayload(
  context: CommentCorrectionContext,
  proposedIntent: string,
  reporterViewerKey: string,
  userNote?: string,
): import("./intentCorrectionTypes").IntentCorrectionSubmitPayload {
  return {
    source_comment: {
      id: context.sourceCommentId,
      room_id: context.roomId,
      text: context.text,
      author_display_name: context.authorDisplayName,
      created_at: context.createdAt,
    },
    prediction: {
      intent: context.predictedIntent,
      confidence: context.predictionConfidence,
      model_id: context.modelId,
      model_version: context.modelVersion,
    },
    proposed_intent: proposedIntent.trim().toUpperCase(),
    reporter_viewer_key: reporterViewerKey,
    user_note: userNote?.trim() || undefined,
  };
}
