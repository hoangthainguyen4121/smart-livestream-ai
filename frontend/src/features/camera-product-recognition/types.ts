export type ImageSignature = {
  dHash: string;
  colorHistogram: number[];
};

export type CatalogImageSignature = {
  productId: string;
  productName: string;
  imageUrl: string;
  signature: ImageSignature;
};

export type CameraProductMatch = {
  productId: string;
  productName: string;
  score: number;
  confidence: number;
  source: "camera_vision";
  explanation: string;
};

export type CameraProductDetectionState = {
  match: CameraProductMatch | null;
  isRunning: boolean;
  lastError: string | null;
  lastRecognizedAt: string | null;
};

export const MIN_CAMERA_VISION_CONFIDENCE = 0.55;
export const AUTO_APPLY_CAMERA_VISION_CONFIDENCE = 0.65;
export const CAMERA_RECOGNITION_INTERVAL_MS = 3_000;
