import type { ArDetectionResult, BrowserArEffect } from "../types";
import {
  drawBlush,
  drawCrown,
  drawFloatingLabel,
  drawGlasses,
  drawLandmarkDebug,
  drawLipstick,
} from "./faceEffects";

export type RenderBrowserArOptions = {
  debugOverlay?: boolean;
  hostLabel?: string;
};

export function renderBrowserArEffect(
  context: CanvasRenderingContext2D,
  effect: BrowserArEffect,
  detection: ArDetectionResult | null,
  options: RenderBrowserArOptions = {},
): number {
  const startedAt = performance.now();
  const face = detection?.faces[0];
  if (!face) {
    return performance.now() - startedAt;
  }

  if (options.debugOverlay) {
    drawLandmarkDebug(context, face);
  }

  switch (effect) {
    case "glasses":
      drawGlasses(context, face);
      break;
    case "makeup_lite":
      drawBlush(context, face);
      drawLipstick(context, face);
      break;
    case "full_filter":
      drawGlasses(context, face);
      drawCrown(context, face);
      drawBlush(context, face);
      drawLipstick(context, face);
      drawFloatingLabel(context, face, options.hostLabel ?? "@hoang");
      break;
    case "none":
      break;
  }

  return performance.now() - startedAt;
}
