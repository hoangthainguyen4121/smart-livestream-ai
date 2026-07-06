import type { HandVisionDebugSnapshot } from "./handVisionDebugTypes";

export function drawHandVisionDebugOverlay(
  context: CanvasRenderingContext2D,
  snapshot: HandVisionDebugSnapshot,
  width: number,
  height: number,
): void {
  context.clearRect(0, 0, width, height);

  if (!snapshot.handDetected) {
    context.fillStyle = "rgba(250, 204, 21, 0.92)";
    context.font = "bold 14px Arial, sans-serif";
    context.fillText("HAND DEBUG: chưa thấy tay", 12, 24);
    return;
  }

  context.fillStyle = "rgba(0, 255, 180, 0.9)";
  for (const point of snapshot.landmarks) {
    context.beginPath();
    context.arc(point.x, point.y, 3, 0, Math.PI * 2);
    context.fill();
  }

  if (snapshot.cropRect) {
    const { x, y, width: cropWidth, height: cropHeight } = snapshot.cropRect;
    const hasObject = snapshot.holdsObject;
    context.fillStyle = hasObject ? "rgba(34, 197, 94, 0.18)" : "rgba(250, 204, 21, 0.16)";
    context.fillRect(x, y, cropWidth, cropHeight);
    context.strokeStyle = hasObject ? "rgba(34, 197, 94, 0.95)" : "rgba(234, 179, 8, 0.95)";
    context.lineWidth = 2;
    context.setLineDash([8, 6]);
    context.strokeRect(x, y, cropWidth, cropHeight);
    context.setLineDash([]);

    const label = buildDebugLabel(snapshot);
    context.font = "bold 13px Arial, sans-serif";
    const padding = 6;
    const textWidth = context.measureText(label).width;
    const labelX = Math.max(8, Math.min(x, width - textWidth - padding * 2 - 8));
    const labelY = Math.max(y - 10, 22);

    context.fillStyle = "rgba(15, 23, 42, 0.82)";
    context.fillRect(labelX, labelY - 16, textWidth + padding * 2, 22);
    context.fillStyle = "#ecfdf5";
    context.fillText(label, labelX + padding, labelY);
  }

  if (snapshot.cropPreviewDataUrl) {
    drawCropPreview(context, snapshot.cropPreviewDataUrl, width);
  }
}

function buildDebugLabel(snapshot: HandVisionDebugSnapshot): string {
  if (snapshot.status === "matched" && snapshot.productName) {
    const confidence = snapshot.confidence != null ? `${(snapshot.confidence * 100).toFixed(0)}%` : "?";
    return `MATCH: ${snapshot.productName} (${confidence})`;
  }
  if (snapshot.status === "empty_hand") {
    return "HAND ROI: tay mở — chưa thấy vật";
  }
  if (snapshot.status === "no_match") {
    return "HAND ROI: có vật — chưa khớp catalog";
  }
  return "HAND ROI: đang quét vùng cầm";
}

const previewCache = new Map<string, HTMLImageElement>();

function drawCropPreview(
  context: CanvasRenderingContext2D,
  dataUrl: string,
  frameWidth: number,
): void {
  let image = previewCache.get(dataUrl);
  if (!image) {
    image = new Image();
    image.src = dataUrl;
    previewCache.set(dataUrl, image);
    if (previewCache.size > 6) {
      const oldest = previewCache.keys().next().value;
      if (oldest) {
        previewCache.delete(oldest);
      }
    }
  }

  if (!image.complete || image.naturalWidth === 0) {
    return;
  }

  const previewSize = 96;
  const margin = 10;
  const x = frameWidth - previewSize - margin;
  const y = margin;

  context.fillStyle = "rgba(15, 23, 42, 0.78)";
  context.fillRect(x - 4, y - 4, previewSize + 8, previewSize + 24);
  context.drawImage(image, x, y, previewSize, previewSize);
  context.fillStyle = "#ecfdf5";
  context.font = "11px Arial, sans-serif";
  context.fillText("ROI crop", x, y + previewSize + 14);
}
