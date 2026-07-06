import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";

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

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    const options = {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU" as const,
      },
      runningMode: "IMAGE" as const,
      scoreThreshold: 0.35,
      maxResults: 5,
    };

    try {
      this.detector = await ObjectDetector.createFromOptions(vision, options);
    } catch {
      this.detector = await ObjectDetector.createFromOptions(vision, {
        ...options,
        baseOptions: {
          modelAssetPath: MODEL_URL,
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
