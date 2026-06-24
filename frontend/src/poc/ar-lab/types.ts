import {
  CAPTURE_HEIGHT,
  CAPTURE_WIDTH,
  type ArDetectionResult,
  type ArFaceLandmarks,
  type NormalizedPoint,
} from "../../features/browser-ar/types";

export type {
  ArDetectionResult,
  ArFaceLandmarks,
  NormalizedPoint,
};

export { CAPTURE_WIDTH, CAPTURE_HEIGHT };

export type ArEngineId = "face_landmarker" | "legacy_face_mesh";

export type ArLabMode =
  | "raw_camera"
  | "facelandmarker_debug"
  | "glasses_ar"
  | "makeup_lite"
  | "full_filter"
  | "identity_plus_ar";

export type PerformanceVerdict = "excellent" | "good" | "acceptable" | "poor";

export type SubjectiveRating = "excellent" | "good" | "fair" | "poor" | "";

export type ArEngine = {
  id: ArEngineId;
  label: string;
  init(): Promise<void>;
  detect(video: HTMLVideoElement, timestampMs: number): Promise<ArDetectionResult | null>;
  close(): void;
};

export type FrameMetrics = {
  timestamp: number;
  cameraFps: number;
  processingFps: number;
  inferenceMs: number;
  renderMs: number;
  droppedFrames: number;
};

export type ModeBenchmarkSummary = {
  mode: ArLabMode;
  engineId: ArEngineId | "none";
  samples: number;
  avgCameraFps: number;
  avgProcessingFps: number;
  avgInferenceMs: number;
  avgRenderMs: number;
  droppedFrames: number;
  verdict: PerformanceVerdict;
  trackingQuality: SubjectiveRating;
  arStability: SubjectiveRating;
};

export type EngineComparisonSummary = {
  engineId: ArEngineId;
  label: string;
  avgProcessingFps: number;
  avgInferenceMs: number;
  stability: SubjectiveRating;
  complexity: "low" | "medium" | "high";
  recommendation: string;
};

export const MODE_LABELS: Record<ArLabMode, string> = {
  raw_camera: "Mode 0 — RAW_CAMERA",
  facelandmarker_debug: "Mode 1 — FACELANDMARKER_DEBUG",
  glasses_ar: "Mode 2 — GLASSES_AR",
  makeup_lite: "Mode 3 — MAKEUP_LITE",
  full_filter: "Mode 4 — FULL_FILTER",
  identity_plus_ar: "Mode 5 — IDENTITY_PLUS_AR (stub)",
};

export const ENGINE_LABELS: Record<ArEngineId, string> = {
  face_landmarker: "Engine A — MediaPipe Tasks FaceLandmarker",
  legacy_face_mesh: "Engine B — MediaPipe FaceMesh Legacy",
};
