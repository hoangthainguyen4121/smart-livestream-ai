export type CommentCorrectionContext = {
  sourceCommentId: string;
  roomId: string;
  text: string;
  authorDisplayName: string;
  createdAt: string;
  predictedIntent: string;
  predictionConfidence: number;
  modelId: string;
  modelVersion: string;
};

export type IntentCorrectionSubmitPayload = {
  source_comment: {
    id: string;
    room_id: string;
    text: string;
    author_display_name: string;
    created_at: string;
  };
  prediction: {
    intent: string;
    confidence: number;
    model_id: string;
    model_version: string;
  };
  proposed_intent: string;
  reporter_viewer_key: string;
  user_note?: string;
};

export type IntentCorrectionResponse = {
  id: string;
  status: string;
  created_at: string;
};
