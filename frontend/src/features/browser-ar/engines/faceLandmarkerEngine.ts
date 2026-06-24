import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

import type { ArDetectionResult, NormalizedPoint } from "../types";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export class FaceLandmarkerEngine {
  private landmarker: FaceLandmarker | null = null;

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    this.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      numFaces: 1,
    });
  }

  async detect(
    video: HTMLVideoElement,
    timestampMs: number,
  ): Promise<ArDetectionResult | null> {
    if (!this.landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return null;
    }

    const startedAt = performance.now();
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
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
