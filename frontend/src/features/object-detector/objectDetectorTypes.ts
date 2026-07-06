export type ObjectDetectorHit = {
  label: string;
  score: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ObjectDetectorSnapshot = {
  detections: ObjectDetectorHit[];
  inferenceMs: number;
  updatedAt: number;
};

export const EMPTY_OBJECT_DETECTOR_SNAPSHOT: ObjectDetectorSnapshot = {
  detections: [],
  inferenceMs: 0,
  updatedAt: 0,
};
