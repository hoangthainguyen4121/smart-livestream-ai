import { verdictFromFps } from "./performanceVerdict";
import type {
  ArEngineId,
  ArLabMode,
  EngineComparisonSummary,
  FrameMetrics,
  ModeBenchmarkSummary,
  SubjectiveRating,
} from "../types";
import { ENGINE_LABELS, MODE_LABELS } from "../types";

export class BenchmarkCollector {
  private samples: FrameMetrics[] = [];
  private readonly startedAt = performance.now();

  record(sample: FrameMetrics): void {
    this.samples.push(sample);
  }

  reset(): void {
    this.samples = [];
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  get elapsedSeconds(): number {
    return (performance.now() - this.startedAt) / 1000;
  }

  summarizeMode(
    mode: ArLabMode,
    engineId: ArEngineId | "none",
    trackingQuality: SubjectiveRating,
    arStability: SubjectiveRating,
  ): ModeBenchmarkSummary {
    const avgCameraFps = average(this.samples.map((sample) => sample.cameraFps));
    const avgProcessingFps = average(this.samples.map((sample) => sample.processingFps));
    const avgInferenceMs = average(this.samples.map((sample) => sample.inferenceMs));
    const avgRenderMs = average(this.samples.map((sample) => sample.renderMs));
    const droppedFrames = this.samples[this.samples.length - 1]?.droppedFrames ?? 0;

    return {
      mode,
      engineId,
      samples: this.samples.length,
      avgCameraFps,
      avgProcessingFps,
      avgInferenceMs,
      avgRenderMs,
      droppedFrames,
      verdict: verdictFromFps(avgProcessingFps),
      trackingQuality,
      arStability,
    };
  }
}

export function generateModeReportTable(summaries: ModeBenchmarkSummary[]): string {
  const header = "| Mode | FPS | Inference | Render | Verdict |";
  const divider = "| ---- | --- | --------- | ------ | ------- |";
  const rows = summaries.map((summary) => {
    const label = MODE_LABELS[summary.mode].replace(/\|/g, "\\|");
    return `| ${label} | ${summary.avgProcessingFps.toFixed(1)} | ${summary.avgInferenceMs.toFixed(1)} ms | ${summary.avgRenderMs.toFixed(1)} ms | ${summary.verdict} |`;
  });
  return [header, divider, ...rows].join("\n");
}

export function generateEngineComparisonTable(
  summaries: EngineComparisonSummary[],
): string {
  const header = "| Engine | FPS | Stability | Complexity | Recommendation |";
  const divider = "| ------ | --- | --------- | ---------- | -------------- |";
  const rows = summaries.map((summary) => {
    return `| ${summary.label} | ${summary.avgProcessingFps.toFixed(1)} | ${summary.stability || "n/a"} | ${summary.complexity} | ${summary.recommendation} |`;
  });
  return [header, divider, ...rows].join("\n");
}

export function buildEngineComparisonSummary(
  engineId: ArEngineId,
  avgProcessingFps: number,
  avgInferenceMs: number,
  stability: SubjectiveRating,
): EngineComparisonSummary {
  const complexity = engineId === "face_landmarker" ? "medium" : "high";

  const recommendation =
    engineId === "face_landmarker"
      ? "Preferred default if FPS and stability meet targets"
      : "Comparison baseline only; avoid for v1 unless it clearly wins";

  return {
    engineId,
    label: ENGINE_LABELS[engineId],
    avgProcessingFps,
    avgInferenceMs,
    stability,
    complexity,
    recommendation,
  };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
