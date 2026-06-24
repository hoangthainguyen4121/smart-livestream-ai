import type { BoundingBox, FaceInferenceResult } from "../api/inference";


export type CaptureLayout = {
  captureWidth: number;
  captureHeight: number;
  offsetX: number;
  offsetY: number;
  drawWidth: number;
  drawHeight: number;
  sourceWidth: number;
  sourceHeight: number;
};

export type VideoDisplayLayout = {
  elementWidth: number;
  elementHeight: number;
  offsetX: number;
  offsetY: number;
  drawWidth: number;
  drawHeight: number;
  sourceWidth: number;
  sourceHeight: number;
};

export type DisplayFace = {
  label: string;
  similarity: number | null;
  is_known: boolean;
  bbox: BoundingBox;
};

export type DisplayLabelAnchor = {
  x: number;
  y: number;
  label: string;
  is_known: boolean;
  similarity: number | null;
  bbox: BoundingBox;
};

const DEFAULT_LABEL_OFFSET_Y = 16;

export function computeCaptureLayout(
  sourceWidth: number,
  sourceHeight: number,
  captureWidth: number,
  captureHeight: number,
): CaptureLayout {
  const scale = Math.min(captureWidth / sourceWidth, captureHeight / sourceHeight);
  const drawWidth = Math.round(sourceWidth * scale);
  const drawHeight = Math.round(sourceHeight * scale);
  const offsetX = Math.floor((captureWidth - drawWidth) / 2);
  const offsetY = Math.floor((captureHeight - drawHeight) / 2);

  return {
    captureWidth,
    captureHeight,
    offsetX,
    offsetY,
    drawWidth,
    drawHeight,
    sourceWidth,
    sourceHeight,
  };
}

export function computeVideoDisplayLayout(video: HTMLVideoElement): VideoDisplayLayout | null {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  const elementWidth = video.clientWidth;
  const elementHeight = video.clientHeight;

  if (
    sourceWidth === 0 ||
    sourceHeight === 0 ||
    elementWidth === 0 ||
    elementHeight === 0
  ) {
    return null;
  }

  const scale = Math.min(elementWidth / sourceWidth, elementHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = (elementWidth - drawWidth) / 2;
  const offsetY = (elementHeight - drawHeight) / 2;

  return {
    elementWidth,
    elementHeight,
    offsetX,
    offsetY,
    drawWidth,
    drawHeight,
    sourceWidth,
    sourceHeight,
  };
}

export function mapSourceBoxToDisplay(
  bbox: BoundingBox,
  displayLayout: VideoDisplayLayout,
): BoundingBox {
  const scaleX = displayLayout.drawWidth / displayLayout.sourceWidth;
  const scaleY = displayLayout.drawHeight / displayLayout.sourceHeight;

  return {
    x1: displayLayout.offsetX + bbox.x1 * scaleX,
    y1: displayLayout.offsetY + bbox.y1 * scaleY,
    x2: displayLayout.offsetX + bbox.x2 * scaleX,
    y2: displayLayout.offsetY + bbox.y2 * scaleY,
  };
}

export function mapCaptureBoxToDisplay(
  bbox: BoundingBox,
  captureLayout: CaptureLayout,
  displayLayout: VideoDisplayLayout,
): BoundingBox {
  const toNormalizedX = (value: number) =>
    (value - captureLayout.offsetX) / captureLayout.drawWidth;
  const toNormalizedY = (value: number) =>
    (value - captureLayout.offsetY) / captureLayout.drawHeight;

  const nx1 = clamp01(toNormalizedX(bbox.x1));
  const ny1 = clamp01(toNormalizedY(bbox.y1));
  const nx2 = clamp01(toNormalizedX(bbox.x2));
  const ny2 = clamp01(toNormalizedY(bbox.y2));

  return {
    x1: displayLayout.offsetX + nx1 * displayLayout.drawWidth,
    y1: displayLayout.offsetY + ny1 * displayLayout.drawHeight,
    x2: displayLayout.offsetX + nx2 * displayLayout.drawWidth,
    y2: displayLayout.offsetY + ny2 * displayLayout.drawHeight,
  };
}

export function mapFacesToDisplay(
  faces: FaceInferenceResult[],
  captureLayout: CaptureLayout,
  displayLayout: VideoDisplayLayout,
): DisplayFace[] {
  return faces.map((face) => ({
    label: face.label,
    similarity: face.similarity,
    is_known: face.is_known,
    bbox: mapCaptureBoxToDisplay(face.bbox, captureLayout, displayLayout),
  }));
}

export function lerpDisplayFaces(
  previousFaces: DisplayFace[],
  targetFaces: DisplayFace[],
  progress: number,
): DisplayFace[] {
  const t = clamp01(progress);
  if (previousFaces.length === 0) {
    return targetFaces;
  }

  return targetFaces.map((targetFace, index) => {
    const previousFace = previousFaces[index] ?? targetFace;
    return {
      ...targetFace,
      bbox: {
        x1: lerp(previousFace.bbox.x1, targetFace.bbox.x1, t),
        y1: lerp(previousFace.bbox.y1, targetFace.bbox.y1, t),
        x2: lerp(previousFace.bbox.x2, targetFace.bbox.x2, t),
        y2: lerp(previousFace.bbox.y2, targetFace.bbox.y2, t),
      },
    };
  });
}

export function faceToLabelAnchor(
  face: DisplayFace,
  offsetY: number = DEFAULT_LABEL_OFFSET_Y,
): DisplayLabelAnchor {
  return {
    x: (face.bbox.x1 + face.bbox.x2) / 2,
    y: face.bbox.y1 - offsetY,
    label: face.label,
    is_known: face.is_known,
    similarity: face.similarity,
    bbox: face.bbox,
  };
}

export function facesToLabelAnchors(faces: DisplayFace[]): DisplayLabelAnchor[] {
  return faces.filter((face) => face.is_known).map((face) => faceToLabelAnchor(face));
}

export function lerpLabelAnchors(
  previousAnchors: DisplayLabelAnchor[],
  targetAnchors: DisplayLabelAnchor[],
  progress: number,
): DisplayLabelAnchor[] {
  const t = clamp01(progress);
  if (previousAnchors.length === 0) {
    return targetAnchors;
  }

  if (targetAnchors.length === 0) {
    return previousAnchors;
  }

  return targetAnchors.map((targetAnchor, index) => {
    const previousAnchor = previousAnchors[index] ?? targetAnchor;
    return {
      ...targetAnchor,
      x: lerp(previousAnchor.x, targetAnchor.x, t),
      y: lerp(previousAnchor.y, targetAnchor.y, t),
    };
  });
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}
