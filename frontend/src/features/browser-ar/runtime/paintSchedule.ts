/** True when the canvas paint loop appears stalled (rAF occluded/paused). */
export function shouldFallbackPaint(
  nowMs: number,
  lastPaintAtMs: number,
  minIntervalMs: number,
): boolean {
  if (minIntervalMs <= 0) {
    return true;
  }
  if (lastPaintAtMs <= 0) {
    return true;
  }
  return nowMs - lastPaintAtMs >= minIntervalMs;
}
