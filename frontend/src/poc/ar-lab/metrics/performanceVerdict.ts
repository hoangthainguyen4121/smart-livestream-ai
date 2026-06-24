import type { PerformanceVerdict } from "../types";

export function verdictFromFps(fps: number): PerformanceVerdict {
  if (fps >= 30) {
    return "excellent";
  }
  if (fps >= 25) {
    return "good";
  }
  if (fps >= 20) {
    return "acceptable";
  }
  return "poor";
}

export function verdictLabel(verdict: PerformanceVerdict): string {
  switch (verdict) {
    case "excellent":
      return "Excellent (>= 30 FPS)";
    case "good":
      return "Good (>= 25 FPS)";
    case "acceptable":
      return "Acceptable (>= 20 FPS)";
    case "poor":
      return "Poor (< 20 FPS)";
  }
}
