import { useEffect, useMemo, useRef, useState } from "react";

import { ArLabControls } from "./components/ArLabControls";
import { ArLabMetricsPanel } from "./components/ArLabMetricsPanel";
import { ArBenchmarkHarness, type HarnessSnapshot } from "./harness/arBenchmarkHarness";
import { BenchmarkCollector } from "./metrics/benchmarkCollector";
import {
  buildDefaultEngineSummaries,
  generateArLabReport,
} from "./report/generateReport";
import type {
  ArEngineId,
  ArLabMode,
  EngineComparisonSummary,
  ModeBenchmarkSummary,
  SubjectiveRating,
} from "./types";
import { CAPTURE_HEIGHT, CAPTURE_WIDTH } from "./types";
import "./styles/ar-lab.css";

const BENCHMARK_DURATION_MS = 30_000;

export function ArLabPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const harnessRef = useRef<ArBenchmarkHarness | null>(null);
  const collectorRef = useRef(new BenchmarkCollector());
  const benchmarkTimerRef = useRef<number | null>(null);
  const benchmarkRunningRef = useRef(false);

  const [mode, setMode] = useState<ArLabMode>("raw_camera");
  const [engineId, setEngineId] = useState<ArEngineId>("face_landmarker");
  const [trackingQuality, setTrackingQuality] = useState<SubjectiveRating>("");
  const [arStability, setArStability] = useState<SubjectiveRating>("");
  const [snapshot, setSnapshot] = useState<HarnessSnapshot | null>(null);
  const [latestSummary, setLatestSummary] = useState<ModeBenchmarkSummary | null>(null);
  const [modeSummaries, setModeSummaries] = useState<ModeBenchmarkSummary[]>([]);
  const [engineSummaries, setEngineSummaries] = useState<EngineComparisonSummary[]>([]);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkSampleCount, setBenchmarkSampleCount] = useState(0);
  const [reportText, setReportText] = useState("");
  const [startupError, setStartupError] = useState<string | null>(null);

  const browserInfo = useMemo(
    () => `${navigator.userAgent} | ${navigator.platform || "unknown platform"}`,
    [],
  );

  useEffect(() => {
    benchmarkRunningRef.current = benchmarkRunning;
  }, [benchmarkRunning]);

  useEffect(() => {
    const harness = new ArBenchmarkHarness();
    harnessRef.current = harness;
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    void harness
      .start(canvas, {
        mode,
        engineId,
        onMetrics: (metrics) => {
          if (benchmarkRunningRef.current) {
            collectorRef.current.record(metrics);
          }
        },
        onSnapshot: setSnapshot,
      })
      .catch((error) => {
        setStartupError(
          error instanceof Error ? error.message : "Unable to start AR benchmark harness.",
        );
      });

    return () => {
      if (benchmarkTimerRef.current) {
        window.clearTimeout(benchmarkTimerRef.current);
      }
      void harness.stop();
      harnessRef.current = null;
    };
  }, []);

  useEffect(() => {
    const harness = harnessRef.current;
    if (!harness) {
      return;
    }
    void harness.setMode(mode).catch((error) => {
      setStartupError(error instanceof Error ? error.message : "Unable to switch AR mode.");
    });
  }, [mode]);

  useEffect(() => {
    const harness = harnessRef.current;
    if (!harness || mode === "raw_camera") {
      return;
    }
    void harness.setEngine(engineId).catch((error) => {
      setStartupError(error instanceof Error ? error.message : "Unable to switch AR engine.");
    });
  }, [engineId, mode]);

  function handleStartBenchmark(): void {
    collectorRef.current.reset();
    setBenchmarkSampleCount(0);
    setBenchmarkRunning(true);
    benchmarkRunningRef.current = true;
    if (benchmarkTimerRef.current) {
      window.clearTimeout(benchmarkTimerRef.current);
    }

    const sampleTimer = window.setInterval(() => {
      setBenchmarkSampleCount(collectorRef.current.sampleCount);
    }, 500);

    benchmarkTimerRef.current = window.setTimeout(() => {
      window.clearInterval(sampleTimer);
      const summary = collectorRef.current.summarizeMode(
        mode,
        mode === "raw_camera" ? "none" : engineId,
        trackingQuality,
        arStability,
      );
      setLatestSummary(summary);
      setModeSummaries((current) => {
        const filtered = current.filter(
          (entry) => !(entry.mode === summary.mode && entry.engineId === summary.engineId),
        );
        return [...filtered, summary];
      });

      if (mode !== "raw_camera") {
        setEngineSummaries((current) => {
          const filtered = current.filter((entry) => entry.engineId !== engineId);
          return [
            ...filtered,
            ...buildDefaultEngineSummaries({
              [engineId]: {
                avgProcessingFps: summary.avgProcessingFps,
                avgInferenceMs: summary.avgInferenceMs,
                stability: arStability,
              },
            }),
          ];
        });
      }

      setBenchmarkRunning(false);
      benchmarkRunningRef.current = false;
      setBenchmarkSampleCount(collectorRef.current.sampleCount);
      benchmarkTimerRef.current = null;
    }, BENCHMARK_DURATION_MS);
  }

  function handleExportReport(): void {
    const emptyRuns = modeSummaries.filter((summary) => summary.samples === 0);
    const report = generateArLabReport({
      modeSummaries,
      engineSummaries,
      notes: [
        "This report was generated by the AR Technology Lab spike.",
        "Run each mode and engine combination with the 30s benchmark before exporting.",
        `Browser: ${browserInfo}`,
        ...(emptyRuns.length > 0
          ? [
              `Warning: ${emptyRuns.length} benchmark run(s) recorded 0 samples — re-run after refreshing the page.`,
            ]
          : []),
      ],
    });
    setReportText(report);
    void navigator.clipboard.writeText(report);
  }

  return (
    <main className="arLabPage">
      <header className="arLabHeader">
        <div>
          <p className="arLabEyebrow">Technology feasibility spike</p>
          <h1>AR Technology Lab</h1>
          <p className="arLabIntro">
            Pure browser-side AR benchmark harness. No backend identity, no dashboard integration,
            no product UI. Capture {CAPTURE_WIDTH}x{CAPTURE_HEIGHT}, latest-frame-only processing,
            shared metrics across engines and modes.
          </p>
        </div>
        <div className="arLabHeaderLinks">
          <a href="/">Back to dashboard demo</a>
        </div>
      </header>

      {startupError ? <p className="arLabError">{startupError}</p> : null}

      <div className="arLabLayout">
        <section className="arLabPreviewPanel">
          <canvas
            ref={canvasRef}
            width={CAPTURE_WIDTH}
            height={CAPTURE_HEIGHT}
            className="arLabCanvas"
          />
          <p className="arLabBrowserInfo">{browserInfo}</p>
        </section>

        <aside className="arLabSidebar">
          <ArLabControls
            mode={mode}
            engineId={engineId}
            trackingQuality={trackingQuality}
            arStability={arStability}
            benchmarkRunning={benchmarkRunning}
            benchmarkSampleCount={benchmarkSampleCount}
            onModeChange={setMode}
            onEngineChange={setEngineId}
            onTrackingQualityChange={setTrackingQuality}
            onArStabilityChange={setArStability}
            onStartBenchmark={handleStartBenchmark}
            onExportReport={handleExportReport}
          />
          <ArLabMetricsPanel snapshot={snapshot} latestSummary={latestSummary} />
        </aside>
      </div>

      <section className="arLabPanel arLabReportPanel">
        <h2>Phase 4 report output</h2>
        <p>
          Run the 30s benchmark for each mode/engine you want to compare, set subjective tracking
          and stability ratings, then export the markdown report.
        </p>
        <textarea
          className="arLabReportOutput"
          readOnly
          value={reportText}
          placeholder="Exported markdown report will appear here."
          rows={18}
        />
      </section>
    </main>
  );
}
