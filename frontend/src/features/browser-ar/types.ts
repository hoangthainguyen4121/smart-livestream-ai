export type NormalizedPoint = {
  x: number;
  y: number;
  z?: number;
};

export type ArFaceLandmarks = {
  points: NormalizedPoint[];
};

export type ArDetectionResult = {
  faces: ArFaceLandmarks[];
  inferenceMs: number;
};

export type BrowserArEffect = "none" | "glasses" | "makeup_lite" | "full_filter";

export type BrowserArStats = {
  cameraFps: number;
  processingFps: number;
  inferenceMs: number;
  renderMs: number;
  effect: BrowserArEffect;
  errorMessage: string | null;
};

export const CAPTURE_WIDTH = 640;
export const CAPTURE_HEIGHT = 480;

export const BROWSER_AR_EFFECT_LABELS: Record<BrowserArEffect, string> = {
  none: "None",
  glasses: "Glasses",
  makeup_lite: "Makeup Lite",
  full_filter: "Full Filter",
};
