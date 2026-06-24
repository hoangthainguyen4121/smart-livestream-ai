import type { ArEngineId, ArLabMode, SubjectiveRating } from "../types";
import { ENGINE_LABELS, MODE_LABELS } from "../types";

type ArLabControlsProps = {
  mode: ArLabMode;
  engineId: ArEngineId;
  trackingQuality: SubjectiveRating;
  arStability: SubjectiveRating;
  benchmarkRunning: boolean;
  benchmarkSampleCount: number;
  onModeChange: (mode: ArLabMode) => void;
  onEngineChange: (engineId: ArEngineId) => void;
  onTrackingQualityChange: (value: SubjectiveRating) => void;
  onArStabilityChange: (value: SubjectiveRating) => void;
  onStartBenchmark: () => void;
  onExportReport: () => void;
};

const MODES = Object.keys(MODE_LABELS) as ArLabMode[];
const ENGINES = Object.keys(ENGINE_LABELS) as ArEngineId[];
const SUBJECTIVE_OPTIONS: SubjectiveRating[] = ["", "excellent", "good", "fair", "poor"];

export function ArLabControls({
  mode,
  engineId,
  trackingQuality,
  arStability,
  benchmarkRunning,
  benchmarkSampleCount,
  onModeChange,
  onEngineChange,
  onTrackingQualityChange,
  onArStabilityChange,
  onStartBenchmark,
  onExportReport,
}: ArLabControlsProps) {
  return (
    <section className="arLabPanel">
      <h2>Controls</h2>
      <label className="arLabField">
        <span>Mode</span>
        <select value={mode} onChange={(event) => onModeChange(event.target.value as ArLabMode)}>
          {MODES.map((entry) => (
            <option key={entry} value={entry}>
              {MODE_LABELS[entry]}
            </option>
          ))}
        </select>
      </label>

      <label className="arLabField">
        <span>Engine</span>
        <select
          value={engineId}
          disabled={mode === "raw_camera"}
          onChange={(event) => onEngineChange(event.target.value as ArEngineId)}
        >
          {ENGINES.map((entry) => (
            <option key={entry} value={entry}>
              {ENGINE_LABELS[entry]}
            </option>
          ))}
        </select>
      </label>

      <label className="arLabField">
        <span>Subjective tracking quality</span>
        <select
          value={trackingQuality}
          onChange={(event) => onTrackingQualityChange(event.target.value as SubjectiveRating)}
        >
          {SUBJECTIVE_OPTIONS.map((entry) => (
            <option key={entry || "unset"} value={entry}>
              {entry || "Not set"}
            </option>
          ))}
        </select>
      </label>

      <label className="arLabField">
        <span>Subjective AR stability</span>
        <select
          value={arStability}
          onChange={(event) => onArStabilityChange(event.target.value as SubjectiveRating)}
        >
          {SUBJECTIVE_OPTIONS.map((entry) => (
            <option key={entry || "unset"} value={entry}>
              {entry || "Not set"}
            </option>
          ))}
        </select>
      </label>

      <div className="arLabActions">
        <button type="button" onClick={onStartBenchmark} disabled={benchmarkRunning}>
          {benchmarkRunning
            ? `Benchmark running... (${benchmarkSampleCount} samples)`
            : "Run 30s benchmark"}
        </button>
        <button type="button" onClick={onExportReport}>
          Export report
        </button>
      </div>
    </section>
  );
}
