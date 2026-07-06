import type { NormalizedHandLandmark } from "./handLandmarkerEngine";

export type HandCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const PALM_LANDMARK_INDICES = [0, 1, 5, 9, 13, 17];

export function mirrorNormalizedLandmarks(
  landmarks: NormalizedHandLandmark[],
): NormalizedHandLandmark[] {
  return landmarks.map((point) => ({
    ...point,
    x: 1 - point.x,
  }));
}

export function computeHandCropRect(
  landmarks: NormalizedHandLandmark[],
  frameWidth: number,
  frameHeight: number,
  paddingRatio = 0.35,
): HandCropRect {
  const points = PALM_LANDMARK_INDICES.map((index) => landmarks[index]).filter(Boolean);
  const xs = points.map((point) => point.x * frameWidth);
  const ys = points.map((point) => point.y * frameHeight);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const width = Math.max(24, maxX - minX);
  const height = Math.max(24, maxY - minY);
  const padX = width * paddingRatio;
  const padY = height * paddingRatio;

  const x = Math.max(0, Math.floor(minX - padX));
  const y = Math.max(0, Math.floor(minY - padY));
  const boundedWidth = Math.min(frameWidth - x, Math.ceil(width + padX * 2));
  const boundedHeight = Math.min(frameHeight - y, Math.ceil(height + padY * 2));

  return {
    x,
    y,
    width: Math.max(24, boundedWidth),
    height: Math.max(24, boundedHeight),
  };
}

export function cropImageData(frame: ImageData, rect: HandCropRect): ImageData {
  const source = frame.data;
  const cropped = new Uint8ClampedArray(rect.width * rect.height * 4);

  for (let row = 0; row < rect.height; row += 1) {
    for (let column = 0; column < rect.width; column += 1) {
      const sourceX = rect.x + column;
      const sourceY = rect.y + row;
      const sourceIndex = (sourceY * frame.width + sourceX) * 4;
      const targetIndex = (row * rect.width + column) * 4;
      cropped[targetIndex] = source[sourceIndex];
      cropped[targetIndex + 1] = source[sourceIndex + 1];
      cropped[targetIndex + 2] = source[sourceIndex + 2];
      cropped[targetIndex + 3] = source[sourceIndex + 3];
    }
  }

  if (typeof ImageData !== "undefined") {
    return new ImageData(cropped, rect.width, rect.height);
  }

  return { data: cropped, width: rect.width, height: rect.height } as ImageData;
}

export function imageDataToPngBase64(imageData: ImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to acquire canvas context for PNG export.");
  }
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

export function pickPrimaryHand(
  hands: NormalizedHandLandmark[][],
): NormalizedHandLandmark[] | null {
  if (hands.length === 0) {
    return null;
  }

  if (hands.length === 1) {
    return hands[0] ?? null;
  }

  const ranked = [...hands].sort((left, right) => {
    const leftArea = handBoundingArea(left);
    const rightArea = handBoundingArea(right);
    return rightArea - leftArea;
  });
  return ranked[0] ?? null;
}

function handBoundingArea(landmarks: NormalizedHandLandmark[]): number {
  const xs = landmarks.map((point) => point.x);
  const ys = landmarks.map((point) => point.y);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}
