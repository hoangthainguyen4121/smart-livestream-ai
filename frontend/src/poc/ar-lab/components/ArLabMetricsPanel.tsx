import { verdictFromFps, verdictLabel } from "../metrics/performanceVerdict";
import type { HarnessSnapshot } from "../harness/arBenchmarkHarness";
import type { ModeBenchmarkSummary } from "../types";
import { ENGINE_LABELS, MODE_LABELS } from "../types";

type ArLabMetricsPanelProps = {
  snapshot: HarnessSnapshot | null;
  latestSummary: ModeBenchmarkSummary | null;
};

export function ArLabMetricsPanel({ snapshot, latestSummary }: ArLabMetricsPanelProps) {
  const processingFps = snapshot?.processingFps ?? 0;
  const verdict = verdictFromFps(processingFps);

  return (
    <section className="arLabPanel">
      <h2>Metrics</h2>
      <dl className="arLabMetricsGrid">
        <div>
          <dt>Camera FPS</dt>
          <dd>{formatNumber(snapshot?.cameraFps)}</dd>
        </div>
        <div>
          <dt>Processing FPS</dt>
          <dd>{formatNumber(snapshot?.processingFps)}</dd>
        </div>
        <div>
          <dt>Inference ms</dt>
          <dd>{formatNumber(snapshot?.inferenceMs)}</dd>
        </div>
        <div>
          <dt>Render ms</dt>
          <dd>{formatNumber(snapshot?.renderMs)}</dd>
        </div>
        <div>
          <dt>Dropped frames</dt>
          <dd>{snapshot?.droppedFrames ?? 0}</dd>
        </div>
        <div>
          <dt>Active mode</dt>
          <dd>{snapshot ? MODE_LABELS[snapshot.activeMode] : "—"}</dd>
        </div>
        <div>
          <dt>Active engine</dt>
          <dd>
            {snapshot?.activeEngine === "none"
              ? "none"
              : snapshot
                ? ENGINE_LABELS[snapshot.activeEngine]
                : "—"}
          </dd>
        </div>
        <div>
          <dt>Camera resolution</dt>
          <dd>{snapshot?.cameraResolution ?? "—"}</dd>
        </div>
        <div>
          <dt>Memory (Chrome)</dt>
          <dd>
            {snapshot?.memoryUsedMb != null
              ? `${snapshot.memoryUsedMb.toFixed(1)} MB`
              : "n/a"}
          </dd>
        </div>
        <div>
          <dt>Verdict</dt>
          <dd className={`arLabVerdict arLabVerdict--${verdict}`}>{verdictLabel(verdict)}</dd>
        </div>
      </dl>

      {latestSummary ? (
        <div className="arLabLatestSummary">
          <h3>Latest 30s benchmark</h3>
          <p>
            {MODE_LABELS[latestSummary.mode]} · {latestSummary.avgProcessingFps.toFixed(1)} FPS ·{" "}
            inference {latestSummary.avgInferenceMs.toFixed(1)} ms · render{" "}
            {latestSummary.avgRenderMs.toFixed(1)} ms
          </p>
        </div>
      ) : null}

      {snapshot?.errorMessage ? <p className="arLabError">{snapshot.errorMessage}</p> : null}
    </section>
  );
}

function formatNumber(value: number | undefined): string {
  if (value == null) {
    return "—";
  }
  return value.toFixed(1);
}
