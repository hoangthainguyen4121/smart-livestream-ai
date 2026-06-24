import { FaceMesh, type Results } from "@mediapipe/face_mesh";

import type { ArDetectionResult, ArEngine, NormalizedPoint } from "../types";

const LEGACY_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh";

export class LegacyFaceMeshEngine implements ArEngine {
  readonly id = "legacy_face_mesh" as const;
  readonly label = "MediaPipe FaceMesh Legacy";
  private faceMesh: FaceMesh | null = null;
  private pending:
    | {
        resolve: (value: ArDetectionResult | null) => void;
        startedAt: number;
        width: number;
        height: number;
      }
    | null = null;

  async init(): Promise<void> {
    this.faceMesh = new FaceMesh({
      locateFile: (file) => `${LEGACY_BASE}/${file}`,
    });
    this.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    this.faceMesh.onResults((results) => this.handleResults(results));
  }

  detect(video: HTMLVideoElement, _timestampMs: number): Promise<ArDetectionResult | null> {
    if (!this.faceMesh || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return Promise.resolve(null);
    }

    if (this.pending) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      this.pending = {
        resolve,
        startedAt: performance.now(),
        width: video.videoWidth,
        height: video.videoHeight,
      };
      this.faceMesh?.send({ image: video });
    });
  }

  close(): void {
    this.faceMesh?.close();
    this.faceMesh = null;
    this.pending = null;
  }

  private handleResults(results: Results): void {
    if (!this.pending) {
      return;
    }

    const { resolve, startedAt, width, height } = this.pending;
    this.pending = null;
    const inferenceMs = performance.now() - startedAt;

    const faces =
      results.multiFaceLandmarks?.map((landmarks) => ({
        points: landmarks.map(
          (point): NormalizedPoint => ({
            x: point.x * width,
            y: point.y * height,
            z: point.z,
          }),
        ),
      })) ?? [];

    resolve({ faces, inferenceMs });
  }
}
