export type ObjectDetectorHit = {
  label: string;
  score: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ObjectDetectorSnapshot = {
  /** Demo product allowlist hits for the product panel/overlay. */
  detections: ObjectDetectorHit[];
  /** Score-filtered COCO hits for visual moderation (no product allowlist). */
  allDetections: ObjectDetectorHit[];
  inferenceMs: number;
  updatedAt: number;
  sourceWidth: number;
  sourceHeight: number;
};

export const EMPTY_OBJECT_DETECTOR_SNAPSHOT: ObjectDetectorSnapshot = {
  detections: [],
  allDetections: [],
  inferenceMs: 0,
  updatedAt: 0,
  sourceWidth: 0,
  sourceHeight: 0,
};
