import { FaceLandmarkerEngine as CoreFaceLandmarkerEngine } from "../../../features/browser-ar/engines/faceLandmarkerEngine";
import type { ArDetectionResult } from "../types";
import type { ArEngine } from "../types";

export class FaceLandmarkerEngine implements ArEngine {
  readonly id = "face_landmarker" as const;
  readonly label = "MediaPipe Tasks FaceLandmarker";
  private readonly engine = new CoreFaceLandmarkerEngine();

  init(): Promise<void> {
    return this.engine.init();
  }

  detect(video: HTMLVideoElement, timestampMs: number): Promise<ArDetectionResult | null> {
    return this.engine.detect(video, timestampMs);
  }

  close(): void {
    this.engine.close();
  }
}
