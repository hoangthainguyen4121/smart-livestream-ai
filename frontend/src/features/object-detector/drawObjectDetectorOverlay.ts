import type { Locale } from "../../i18n/translations";
import type { ObjectDetectorSnapshot } from "./objectDetectorTypes";
import { translateCocoLabel } from "./cocoLabelTranslations";

const BOX_COLOR = "rgba(59, 130, 246, 0.95)";

export type ObjectDetectorOverlayLabels = {
  locale: Locale;
  hudTemplate: string;
};

function formatHud(template: string, inferenceMs: number): string {
  return template.replace("{ms}", inferenceMs.toFixed(0));
}

export function drawObjectDetectorOverlay(
  context: CanvasRenderingContext2D,
  snapshot: ObjectDetectorSnapshot,
  width: number,
  height: number,
  labels: ObjectDetectorOverlayLabels,
): void {
  context.clearRect(0, 0, width, height);

  if (!snapshot.detections.length) {
    return;
  }

  const hudText = formatHud(labels.hudTemplate, snapshot.inferenceMs);
  context.font = "bold 12px Arial, sans-serif";
  const hudWidth = Math.max(220, context.measureText(hudText).width + 16);

  context.fillStyle = "rgba(15, 23, 42, 0.72)";
  context.fillRect(8, 8, hudWidth, 36);
  context.fillStyle = "#f8fafc";
  context.fillText(hudText, 16, 28);

  for (const hit of snapshot.detections) {
    context.fillStyle = "rgba(59, 130, 246, 0.18)";
    context.fillRect(hit.x, hit.y, hit.width, hit.height);
    context.strokeStyle = BOX_COLOR;
    context.lineWidth = 2;
    context.strokeRect(hit.x, hit.y, hit.width, hit.height);

    const localizedLabel = translateCocoLabel(hit.label, labels.locale);
    const label = `${localizedLabel} ${(hit.score * 100).toFixed(0)}%`;
    context.font = "bold 11px Arial, sans-serif";
    const textWidth = context.measureText(label).width;
    context.fillStyle = "rgba(15, 23, 42, 0.82)";
    context.fillRect(hit.x, Math.max(0, hit.y - 18), textWidth + 8, 18);
    context.fillStyle = "#ecfdf5";
    context.fillText(label, hit.x + 4, Math.max(12, hit.y - 5));
  }
}
