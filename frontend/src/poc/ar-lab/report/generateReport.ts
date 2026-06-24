import {
  buildEngineComparisonSummary,
  generateEngineComparisonTable,
  generateModeReportTable,
} from "../metrics/benchmarkCollector";
import { verdictLabel } from "../metrics/performanceVerdict";
import type {
  ArEngineId,
  EngineComparisonSummary,
  ModeBenchmarkSummary,
  SubjectiveRating,
} from "../types";
import { ENGINE_LABELS, MODE_LABELS } from "../types";

export type ArLabReportInput = {
  modeSummaries: ModeBenchmarkSummary[];
  engineSummaries: EngineComparisonSummary[];
  notes?: string[];
};

export function generateArLabReport(input: ArLabReportInput): string {
  const lines = [
    "# AR Technology Lab — Feasibility Report",
    "",
    "## Research questions",
    "1. Is browser AR technically viable?",
    "2. Can we achieve 25–30 FPS?",
    "3. Can AR effects stay attached to the face?",
    "4. Which engine should become the default?",
    "5. Is identity + AR realistic later?",
    "",
    "## Mode benchmark table",
    generateModeReportTable(input.modeSummaries),
    "",
    "## Mode details",
    ...input.modeSummaries.flatMap((summary) => formatModeDetail(summary)),
    "",
    "## Engine comparison",
    generateEngineComparisonTable(input.engineSummaries),
    "",
    "## Recommendations",
    ...buildRecommendations(input),
  ];

  if (input.notes?.length) {
    lines.push("", "## Notes", ...input.notes.map((note) => `- ${note}`));
  }

  return lines.join("\n");
}

function formatModeDetail(summary: ModeBenchmarkSummary): string[] {
  return [
    `### ${MODE_LABELS[summary.mode]}`,
    `- Engine: ${summary.engineId === "none" ? "none" : ENGINE_LABELS[summary.engineId]}`,
    `- Samples: ${summary.samples}`,
    `- Average camera FPS: ${summary.avgCameraFps.toFixed(1)}`,
    `- Average processing FPS: ${summary.avgProcessingFps.toFixed(1)}`,
    `- Average inference: ${summary.avgInferenceMs.toFixed(1)} ms`,
    `- Average render: ${summary.avgRenderMs.toFixed(1)} ms`,
    `- Dropped frames: ${summary.droppedFrames}`,
    `- Verdict: ${verdictLabel(summary.verdict)}`,
    `- Subjective tracking quality: ${summary.trackingQuality || "not recorded"}`,
    `- Subjective AR stability: ${summary.arStability || "not recorded"}`,
    "",
  ];
}

function buildRecommendations(input: ArLabReportInput): string[] {
  const bestEngine = [...input.engineSummaries].sort(
    (left, right) => right.avgProcessingFps - left.avgProcessingFps,
  )[0];
  const bestMode = [...input.modeSummaries]
    .filter((summary) => summary.mode !== "raw_camera")
    .sort((left, right) => right.avgProcessingFps - left.avgProcessingFps)[0];

  const viability =
    bestMode && bestMode.avgProcessingFps >= 25
      ? "Browser AR appears technically viable on the tested hardware for at least one mode."
      : "Browser AR may not meet the 25–30 FPS target on the tested hardware without further optimization.";

  return [
    `- ${viability}`,
    bestEngine
      ? `- Preferred engine candidate: ${bestEngine.label} (${bestEngine.avgProcessingFps.toFixed(1)} FPS avg).`
      : "- No engine benchmark recorded yet.",
    "- Identity + AR: Mode 5 is stub-only; combine FaceLandmarker locally with a low-rate identity worker later if landmark FPS remains acceptable under FULL_FILTER.",
    "- Exclude backend landmark inference for AR; keep backend for identity/events only.",
  ];
}

export function buildDefaultEngineSummaries(
  records: Partial<
    Record<
      ArEngineId,
      {
        avgProcessingFps: number;
        avgInferenceMs: number;
        stability: SubjectiveRating;
      }
    >
  >,
): EngineComparisonSummary[] {
  return (Object.keys(ENGINE_LABELS) as ArEngineId[])
    .filter((engineId) => records[engineId])
    .map((engineId) => {
      const record = records[engineId]!;
      return buildEngineComparisonSummary(
        engineId,
        record.avgProcessingFps,
        record.avgInferenceMs,
        record.stability,
      );
    });
}
