import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export type NormalizedHandLandmark = {
  x: number;
  y: number;
  z: number;
};

export type HandDetectionResult = {
  hands: NormalizedHandLandmark[][];
  inferenceMs: number;
};

export class HandLandmarkerEngine {
  private landmarker: HandLandmarker | null = null;

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    const options = {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU" as const,
      },
      runningMode: "IMAGE" as const,
      numHands: 2,
      minHandDetectionConfidence: 0.25,
      minHandPresenceConfidence: 0.25,
      minTrackingConfidence: 0.25,
    };

    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, options);
    } catch {
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "CPU",
        },
      });
    }
  }

  detectImage(source: CanvasImageSource): HandDetectionResult | null {
    if (!this.landmarker) {
      return null;
    }

    const startedAt = performance.now();
    const result = this.landmarker.detect(source as HTMLCanvasElement);
    const inferenceMs = performance.now() - startedAt;

    const hands =
      result.landmarks?.map((landmarks) =>
        landmarks.map(
          (point): NormalizedHandLandmark => ({
            x: point.x,
            y: point.y,
            z: point.z,
          }),
        ),
      ) ?? [];

    return { hands, inferenceMs };
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
