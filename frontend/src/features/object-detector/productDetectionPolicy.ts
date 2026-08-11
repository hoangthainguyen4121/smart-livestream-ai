import type { VideoCaptureSource } from "../browser-ar/runtime/videoCaptureSource";
import type { ObjectDetectorHit } from "./objectDetectorTypes";

/** MediaPipe EfficientDet-Lite0 COCO demo focus set (not custom SKU classes). */
export const DEMO_PRODUCT_LABELS = [
  "bottle",
  "cup",
  "handbag",
  "cell phone",
  "book",
] as const;

export type DemoProductLabel = (typeof DEMO_PRODUCT_LABELS)[number];

export const DEFAULT_SCORE_THRESHOLD = 0.5;
export const DEFAULT_MAX_DETECTIONS = 10;
/** ~4 FPS — within the 2–5 FPS MVP budget. */
export const DEFAULT_INFERENCE_INTERVAL_MS = 250;

export type ProductDetectionStatus =
  | "off"
  | "loading"
  | "paused"
  | "detecting"
  | "empty"
  | "error";

export function shouldRunProductDetection(options: {
  enabled: boolean;
  isLive: boolean;
  videoSource: VideoCaptureSource;
}): boolean {
  // camera = live host; file = CV test harness (same canvas → detectCanvas path).
  return (
    options.enabled &&
    options.isLive &&
    (options.videoSource === "camera" || options.videoSource === "file")
  );
}

export function resolveProductDetectionStatus(options: {
  enabled: boolean;
  isLive: boolean;
  videoSource: VideoCaptureSource;
  isLoading: boolean;
  errorMessage: string | null;
  detectionCount: number;
}): ProductDetectionStatus {
  if (!options.enabled) {
    return "off";
  }
  if (options.errorMessage) {
    return "error";
  }
  if (options.isLoading) {
    return "loading";
  }
  if (!shouldRunProductDetection(options)) {
    return "paused";
  }
  return options.detectionCount > 0 ? "detecting" : "empty";
}

export function normalizeCocoLabel(label: string): string {
  return label.trim().toLowerCase();
}

export function isDemoProductLabel(label: string): boolean {
  const normalized = normalizeCocoLabel(label);
  return (DEMO_PRODUCT_LABELS as readonly string[]).includes(normalized);
}

export function filterProductDetections(
  hits: ObjectDetectorHit[],
  options?: {
    scoreThreshold?: number;
    maxDetections?: number;
    allowlist?: readonly string[];
  },
): ObjectDetectorHit[] {
  const scoreThreshold = options?.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD;
  const maxDetections = options?.maxDetections ?? DEFAULT_MAX_DETECTIONS;
  const allowlist = options?.allowlist ?? DEMO_PRODUCT_LABELS;

  return hits
    .filter((hit) => hit.score >= scoreThreshold)
    .filter((hit) => {
      if (!allowlist.length) {
        return true;
      }
      return allowlist.includes(normalizeCocoLabel(hit.label));
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(0, maxDetections));
}

/**
 * Map detection boxes from source canvas pixels into overlay canvas pixels.
 * Camera frames are already mirrored by BrowserArPipeline before detection,
 * so no additional horizontal flip is applied here.
 */
export function mapDetectionBoxToOverlay(
  hit: ObjectDetectorHit,
  sourceWidth: number,
  sourceHeight: number,
  overlayWidth: number,
  overlayHeight: number,
): ObjectDetectorHit {
  const safeSourceWidth = sourceWidth > 0 ? sourceWidth : overlayWidth;
  const safeSourceHeight = sourceHeight > 0 ? sourceHeight : overlayHeight;
  const scaleX = overlayWidth / safeSourceWidth;
  const scaleY = overlayHeight / safeSourceHeight;

  return {
    ...hit,
    x: hit.x * scaleX,
    y: hit.y * scaleY,
    width: hit.width * scaleX,
    height: hit.height * scaleY,
  };
}

export function shouldAcceptDetectionEpoch(
  resultEpoch: number,
  currentEpoch: number,
): boolean {
  return resultEpoch === currentEpoch;
}
