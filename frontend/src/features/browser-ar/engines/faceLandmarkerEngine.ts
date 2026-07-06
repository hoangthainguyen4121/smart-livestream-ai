import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

import type { ArDetectionResult, NormalizedPoint } from "../types";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export class FaceLandmarkerEngine {
  private landmarker: FaceLandmarker | null = null;

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    const options = {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU" as const,
      },
      runningMode: "VIDEO" as const,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      numFaces: 1,
    };

    try {
      this.landmarker = await FaceLandmarker.createFromOptions(vision, options);
    } catch {
      this.landmarker = await FaceLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "CPU",
        },
      });
    }
  }

  async detect(
    video: HTMLVideoElement,
    timestampMs: number,
  ): Promise<ArDetectionResult | null> {
    if (
      !this.landmarker ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth <= 0
    ) {
      return null;
    }

    const startedAt = performance.now();
    try {
      const result = this.landmarker.detectForVideo(video, timestampMs);
      const inferenceMs = performance.now() - startedAt;
      const width = video.videoWidth;
      const height = video.videoHeight;

      const faces =
        result.faceLandmarks?.map((landmarks) => ({
          points: landmarks.map(
            (point): NormalizedPoint => ({
              x: point.x * width,
              y: point.y * height,
              z: point.z,
            }),
          ),
        })) ?? [];

      return { faces, inferenceMs };
    } catch {
      return null;
    }
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
