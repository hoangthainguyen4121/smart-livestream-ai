import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_DETECTIONS,
  DEFAULT_SCORE_THRESHOLD,
} from "./productDetectionPolicy";
import { OBJECT_DETECTOR_MODEL_URL, ObjectDetectorEngine } from "./objectDetectorEngine";

describe("ObjectDetectorEngine config", () => {
  it("uses MediaPipe EfficientDet COCO model URL (not a custom YOLO asset)", () => {
    expect(OBJECT_DETECTOR_MODEL_URL).toContain("efficientdet_lite0");
    expect(OBJECT_DETECTOR_MODEL_URL).toContain("object_detector");
  });

  it("defaults to MVP confidence and max detection limits", () => {
    const engine = new ObjectDetectorEngine();
    expect(DEFAULT_SCORE_THRESHOLD).toBe(0.5);
    expect(DEFAULT_MAX_DETECTIONS).toBe(10);
    // Constructing with overrides should not throw.
    expect(() => new ObjectDetectorEngine({ scoreThreshold: 0.6, maxResults: 3 })).not.toThrow();
    expect(engine).toBeInstanceOf(ObjectDetectorEngine);
  });
});
