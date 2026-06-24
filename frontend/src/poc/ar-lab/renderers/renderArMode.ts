import type { ArDetectionResult, ArLabMode } from "../types";
import {
  drawBlush,
  drawCrown,
  drawFloatingLabel,
  drawGlasses,
  drawLandmarkDebug,
  drawLipstick,
} from "./faceEffects";

export function renderArMode(
  context: CanvasRenderingContext2D,
  mode: ArLabMode,
  detection: ArDetectionResult | null,
): number {
  const startedAt = performance.now();
  const face = detection?.faces[0];
  if (!face) {
    return performance.now() - startedAt;
  }

  switch (mode) {
    case "facelandmarker_debug":
      drawLandmarkDebug(context, face);
      break;
    case "glasses_ar":
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
      drawFloatingLabel(context, face, "@demo");
      break;
    case "identity_plus_ar":
      drawLandmarkDebug(context, face);
      drawFloatingLabel(context, face, "@demo-user");
      break;
    default:
      break;
  }

  return performance.now() - startedAt;
}
