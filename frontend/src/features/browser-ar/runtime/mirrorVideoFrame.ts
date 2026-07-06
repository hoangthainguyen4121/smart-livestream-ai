import type { ArDetectionResult } from "../types";

/** Draw webcam frame mirrored horizontally (selfie preview). */
export function drawMirroredVideoFrame(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
): void {
  context.save();
  context.scale(-1, 1);
  context.drawImage(video, -width, 0, width, height);
  context.restore();
}

/** Map face landmarks from camera space into mirrored canvas space. */
export function mirrorDetectionForCanvas(
  detection: ArDetectionResult | null,
  video: HTMLVideoElement,
  canvasWidth: number,
  canvasHeight: number,
): ArDetectionResult | null {
  if (!detection) {
    return null;
  }

  const videoWidth = video.videoWidth || canvasWidth;
  const videoHeight = video.videoHeight || canvasHeight;
  const scaleX = canvasWidth / videoWidth;
  const scaleY = canvasHeight / videoHeight;

  return {
    inferenceMs: detection.inferenceMs,
    faces: detection.faces.map((face) => ({
      points: face.points.map((point) => ({
        ...point,
        x: canvasWidth - point.x * scaleX,
        y: point.y * scaleY,
      })),
    })),
  };
}
