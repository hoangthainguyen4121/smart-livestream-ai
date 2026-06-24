import type { ArFaceLandmarks, NormalizedPoint } from "../types";

export const LEFT_EYE = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7];
export const RIGHT_EYE = [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382];
export const LEFT_BROW = [70, 63, 105, 66, 107];
export const RIGHT_BROW = [336, 296, 334, 293, 300];
export const LIPS = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185,
];
export const LEFT_CHEEK = 50;
export const RIGHT_CHEEK = 280;
export const FOREHEAD = [10, 151, 9, 8, 168];
export const NOSE_TIP = 1;

export function getPoint(points: NormalizedPoint[], index: number): NormalizedPoint | null {
  return points[index] ?? null;
}

export function drawLandmarkDebug(
  context: CanvasRenderingContext2D,
  face: ArFaceLandmarks,
): void {
  context.fillStyle = "rgba(0, 255, 180, 0.85)";
  for (const point of face.points) {
    context.beginPath();
    context.arc(point.x, point.y, 1.5, 0, Math.PI * 2);
    context.fill();
  }
}

export function drawGlasses(context: CanvasRenderingContext2D, face: ArFaceLandmarks): void {
  const leftOuter = getPoint(face.points, 33);
  const leftInner = getPoint(face.points, 133);
  const rightOuter = getPoint(face.points, 362);
  const rightInner = getPoint(face.points, 263);
  const bridge = getPoint(face.points, 168);
  if (!leftOuter || !leftInner || !rightOuter || !rightInner || !bridge) {
    return;
  }

  const leftRadius = distance(leftOuter, leftInner) * 0.55;
  const rightRadius = distance(rightOuter, rightInner) * 0.55;
  context.strokeStyle = "rgba(20, 20, 20, 0.92)";
  context.lineWidth = 3;
  context.fillStyle = "rgba(80, 160, 255, 0.18)";

  drawLens(context, leftOuter, leftInner, leftRadius);
  drawLens(context, rightOuter, rightInner, rightRadius);

  context.beginPath();
  context.moveTo(leftInner.x, leftInner.y);
  context.lineTo(bridge.x, bridge.y);
  context.lineTo(rightInner.x, rightInner.y);
  context.stroke();
}

export function drawCrown(context: CanvasRenderingContext2D, face: ArFaceLandmarks): void {
  const top = getPoint(face.points, 10);
  const left = getPoint(face.points, 234);
  const right = getPoint(face.points, 454);
  if (!top || !left || !right) {
    return;
  }

  const width = distance(left, right) * 0.55;
  const centerX = top.x;
  const baseY = top.y - width * 0.15;
  context.fillStyle = "rgba(255, 204, 0, 0.88)";
  context.strokeStyle = "rgba(120, 90, 0, 0.9)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(centerX - width * 0.5, baseY);
  context.lineTo(centerX - width * 0.35, baseY - width * 0.45);
  context.lineTo(centerX - width * 0.15, baseY - width * 0.18);
  context.lineTo(centerX, baseY - width * 0.55);
  context.lineTo(centerX + width * 0.15, baseY - width * 0.18);
  context.lineTo(centerX + width * 0.35, baseY - width * 0.45);
  context.lineTo(centerX + width * 0.5, baseY);
  context.closePath();
  context.fill();
  context.stroke();
}

export function drawBlush(context: CanvasRenderingContext2D, face: ArFaceLandmarks): void {
  drawCheekBlush(context, getPoint(face.points, LEFT_CHEEK), 26);
  drawCheekBlush(context, getPoint(face.points, RIGHT_CHEEK), 26);
}

export function drawLipstick(context: CanvasRenderingContext2D, face: ArFaceLandmarks): void {
  const lipPoints = LIPS.map((index) => getPoint(face.points, index)).filter(
    (point): point is NormalizedPoint => point !== null,
  );
  if (lipPoints.length < 4) {
    return;
  }

  context.save();
  context.fillStyle = "rgba(210, 40, 90, 0.42)";
  context.beginPath();
  context.moveTo(lipPoints[0].x, lipPoints[0].y);
  for (const point of lipPoints.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  context.closePath();
  context.fill();
  context.restore();
}

export function drawFloatingLabel(
  context: CanvasRenderingContext2D,
  face: ArFaceLandmarks,
  label: string,
): void {
  const browLeft = getPoint(face.points, LEFT_BROW[1]);
  const browRight = getPoint(face.points, RIGHT_BROW[1]);
  if (!browLeft || !browRight) {
    return;
  }

  const centerX = (browLeft.x + browRight.x) / 2;
  const anchorY = Math.min(browLeft.y, browRight.y) - 18;
  context.font = "600 16px Segoe UI, sans-serif";
  const textWidth = context.measureText(label).width;
  const pillWidth = textWidth + 24;
  const pillHeight = 28;
  const x = centerX - pillWidth / 2;
  const y = anchorY - pillHeight;

  context.fillStyle = "rgba(24, 32, 48, 0.82)";
  roundRect(context, x, y, pillWidth, pillHeight, 14);
  context.fill();
  context.fillStyle = "#ffffff";
  context.fillText(label, x + 12, y + 19);
}

function drawLens(
  context: CanvasRenderingContext2D,
  outer: NormalizedPoint,
  inner: NormalizedPoint,
  radius: number,
): void {
  const centerX = (outer.x + inner.x) / 2;
  const centerY = (outer.y + inner.y) / 2;
  context.beginPath();
  context.ellipse(centerX, centerY, radius, radius * 0.72, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();
}

function drawCheekBlush(
  context: CanvasRenderingContext2D,
  point: NormalizedPoint | null,
  radius: number,
): void {
  if (!point) {
    return;
  }
  const gradient = context.createRadialGradient(
    point.x,
    point.y,
    1,
    point.x,
    point.y,
    radius,
  );
  gradient.addColorStop(0, "rgba(255, 120, 140, 0.34)");
  gradient.addColorStop(1, "rgba(255, 120, 140, 0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fill();
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function distance(a: NormalizedPoint, b: NormalizedPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
