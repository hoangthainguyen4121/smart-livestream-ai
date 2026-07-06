import type { HandCropRect } from "./handRoi";

export type HandVisionDebugPoint = {
  x: number;
  y: number;
};

export type HandVisionDebugSnapshot = {
  handDetected: boolean;
  cropRect: HandCropRect | null;
  landmarks: HandVisionDebugPoint[];
  productName: string | null;
  productId: string | null;
  confidence: number | null;
  score: number | null;
  status: "no_hand" | "scanning" | "empty_hand" | "no_match" | "matched";
  holdsObject: boolean;
  objectScore: number | null;
  cropPreviewDataUrl: string | null;
  updatedAt: string;
};

export const EMPTY_HAND_VISION_DEBUG_SNAPSHOT: HandVisionDebugSnapshot = {
  handDetected: false,
  cropRect: null,
  landmarks: [],
  productName: null,
  productId: null,
  confidence: null,
  score: null,
  status: "scanning",
  holdsObject: false,
  objectScore: null,
  cropPreviewDataUrl: null,
  updatedAt: "",
};
