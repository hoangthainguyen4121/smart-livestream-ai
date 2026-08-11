import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";

import { MEDIAPIPE_WASM_BASE } from "../mediapipe/mediapipeWasmBase";
import {
  DEFAULT_MAX_DETECTIONS,
  DEFAULT_SCORE_THRESHOLD,
} from "./productDetectionPolicy";

export const OBJECT_DETECTOR_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";

export type ObjectDetectorEngineOptions = {
  scoreThreshold?: number;
  maxResults?: number;
};

export type RawObjectDetectionHit = {
  label: string;
  score: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
};

export class ObjectDetectorEngine {
  private detector: ObjectDetector | null = null;
  private readonly scoreThreshold: number;
  private readonly maxResults: number;

  constructor(options: ObjectDetectorEngineOptions = {}) {
    this.scoreThreshold = options.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD;
    this.maxResults = options.maxResults ?? DEFAULT_MAX_DETECTIONS;
  }

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE);
    const options = {
      baseOptions: {
        modelAssetPath: OBJECT_DETECTOR_MODEL_URL,
        delegate: "GPU" as const,
      },
      runningMode: "IMAGE" as const,
      scoreThreshold: this.scoreThreshold,
      maxResults: this.maxResults,
    };

    try {
      this.detector = await ObjectDetector.createFromOptions(vision, options);
    } catch {
      this.detector = await ObjectDetector.createFromOptions(vision, {
        ...options,
        baseOptions: {
          modelAssetPath: OBJECT_DETECTOR_MODEL_URL,
          delegate: "CPU",
        },
      });
    }
  }

  detectCanvas(source: HTMLCanvasElement): RawObjectDetectionHit[] {
    if (!this.detector) {
      return [];
    }
    const result = this.detector.detect(source);
    return this.mapDetections(result.detections ?? []);
  }

  close(): void {
    this.detector?.close();
    this.detector = null;
  }

  private mapDetections(
    detections: Array<{
      categories?: Array<{ categoryName?: string; score?: number }>;
      boundingBox?: {
        originX: number;
        originY: number;
        width: number;
        height: number;
      };
    }>,
  ): RawObjectDetectionHit[] {
    return detections
      .map((detection) => {
        const category = detection.categories?.[0];
        const box = detection.boundingBox;
        if (!category?.categoryName || !box) {
          return null;
        }
        return {
          label: category.categoryName,
          score: category.score ?? 0,
          originX: box.originX,
          originY: box.originY,
          width: box.width,
          height: box.height,
        };
      })
      .filter((entry): entry is RawObjectDetectionHit => entry !== null);
  }
}
