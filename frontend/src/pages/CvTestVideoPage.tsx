import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { detectFirearmOnnxFrame, topFirearmHit } from "../api/firearmOnnxDetector";
import { detectFirearmYoloxFrame } from "../api/firearmYoloxDetector";
import { detectWeaponFrame } from "../api/weaponDetector";
import { ObjectDetectorOverlay } from "../features/object-detector/ObjectDetectorOverlay";
import { useObjectDetectorOverlay } from "../features/object-detector/useObjectDetectorOverlay";
import { useSharpObjectEnforcement } from "../features/object-detector/useSharpObjectEnforcement";
import { useVisualModeration } from "../features/object-detector/useVisualModeration";
import { useAdultModeration } from "../features/adult-moderation/useAdultModeration";
import { useWeaponFrameGate } from "../features/weapon-frame-gate/useWeaponFrameGate";
import { WeaponDetectorOverlay } from "../features/weapon-frame-gate/WeaponDetectorOverlay";
import { subsampleCanvasToJpegDataUrl } from "../features/weapon-frame-gate/weaponFrameGatePolicy";
import { CAPTURE_HEIGHT, CAPTURE_WIDTH } from "../features/browser-ar/types";
import {
  buildWouldTerminateEvent,
  formatSimulatedEvent,
  type SimulatedModerationEvent,
} from "../features/cv-test/cvTestModeration";
import {
  formatAbLatency,
  formatAbPred,
  GUN_AB_FRAME_PRESETS,
  resolveAbExpected,
  summarizeAbDecision,
  type GunAbDetectorCell,
  type GunAbExpected,
  type GunAbRow,
  type GunDetectorBackend,
} from "../features/cv-test/gunDetectorAb";
import { createVideoCanvasFrameSource } from "../features/cv-test/videoCanvasFrameSource";
import {
  createVideoObjectUrl,
  formatVideoClock,
  isAcceptedVideoFile,
  revokeVideoObjectUrl,
} from "../features/cv-test/videoObjectUrl";
import { navigateHash, roomsPath } from "../routing/hashRoute";

const DEFAULT_DINO_INTERVAL_MS = 10_000;
const DEFAULT_ONNX_INTERVAL_MS = 1_000;

export function CvTestVideoPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameSourceRef = useRef<ReturnType<typeof createVideoCanvasFrameSource> | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [resetEpoch, setResetEpoch] = useState(0);
  const [gunBackend, setGunBackend] = useState<GunDetectorBackend>("grounding_dino");
  const [gunIntervalMs, setGunIntervalMs] = useState(DEFAULT_DINO_INTERVAL_MS);
  const [onnxFps, setOnnxFps] = useState<1 | 2>(1);
  const [abPresetId, setAbPresetId] = useState(GUN_AB_FRAME_PRESETS[0]!.id);
  /** Explicit GT for CURRENT frame; empty = only allowed when preset seekSec matches. */
  const [abManualExpected, setAbManualExpected] = useState<GunAbExpected | "">("");
  const [abLabelError, setAbLabelError] = useState<string | null>(null);
  const [abRows, setAbRows] = useState<GunAbRow[]>([]);
  const [abBusy, setAbBusy] = useState(false);
  const [simulatedTerminated, setSimulatedTerminated] = useState(false);
  const [simEvents, setSimEvents] = useState<SimulatedModerationEvent[]>([]);

  const bumpReset = useCallback(() => {
    setResetEpoch((value) => value + 1);
    setSimulatedTerminated(false);
  }, []);

  const getCanvasElement = useCallback(() => {
    frameSourceRef.current?.paintOnce();
    return frameSourceRef.current?.getCanvasElement() ?? canvasRef.current;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    const source = createVideoCanvasFrameSource(canvas);
    frameSourceRef.current = source;
    return () => {
      source.stop();
      frameSourceRef.current = null;
      revokeVideoObjectUrl(objectUrlRef.current);
      objectUrlRef.current = null;
    };
  }, []);

  const pipelineLive = hasVideo && !simulatedTerminated;

  const objectDetector = useObjectDetectorOverlay({
    enabled: hasVideo,
    isLive: pipelineLive,
    videoSource: "file",
    getCanvasElement,
    resetEpoch,
  });

  const visualModeration = useVisualModeration({
    enabled: hasVideo && !simulatedTerminated,
    isActive: objectDetector.isActive && !simulatedTerminated,
    detections: objectDetector.snapshot.allDetections,
  });

  const sharp = useSharpObjectEnforcement({
    enabled: hasVideo && !simulatedTerminated,
    isActive: objectDetector.isActive && !simulatedTerminated,
    detections: objectDetector.snapshot.allDetections,
    snapshotUpdatedAt: objectDetector.snapshot.updatedAt,
    sessionId: null,
    simulateModeration: true,
    resetEpoch,
    terminated: simulatedTerminated,
    onTerminate: (payload) => {
      const event = buildWouldTerminateEvent(payload);
      setSimEvents((prev) => [event, ...prev].slice(0, 20));
      setSimulatedTerminated(true);
    },
  });

  const adultGate = useAdultModeration({
    enabled: hasVideo && !simulatedTerminated,
    isLive: pipelineLive,
    getCanvasElement,
    resetEpoch,
  });

  const weaponGate = useWeaponFrameGate({
    enabled: hasVideo && !simulatedTerminated,
    isLive: pipelineLive,
    getCanvasElement,
    resetEpoch,
    inferenceIntervalMs: gunIntervalMs,
    backend: gunBackend,
    minScore:
      gunBackend === "firearm_yolox"
        ? 0.02
        : gunBackend === "firearm_onnx"
          ? 0.65
          : undefined,
    forceUiEnabled: true,
  });

  const abPreset = useMemo(
    () => GUN_AB_FRAME_PRESETS.find((item) => item.id === abPresetId) ?? GUN_AB_FRAME_PRESETS[0]!,
    [abPresetId],
  );
  const abDecision = useMemo(() => summarizeAbDecision(abRows), [abRows]);

  const selectGunBackend = (next: GunDetectorBackend) => {
    setGunBackend(next);
    setGunIntervalMs(
      next === "firearm_onnx" || next === "firearm_yolox"
        ? Math.round(1000 / onnxFps)
        : DEFAULT_DINO_INTERVAL_MS,
    );
    bumpReset();
  };

  const runAbCompare = async () => {
    const canvas = getCanvasElement();
    if (!canvas || abBusy) {
      return;
    }
    const dataUrl = subsampleCanvasToJpegDataUrl(canvas, { maxEdge: 640, jpegQuality: 0.85 });
    if (!dataUrl) {
      return;
    }
    const videoTimeSec = videoRef.current?.currentTime ?? null;
    const resolved = resolveAbExpected({
      preset: abPreset,
      videoTimeSec,
      manualExpected: abManualExpected,
    });
    if (!resolved.ok) {
      setAbLabelError(resolved.error);
      return;
    }
    setAbLabelError(null);
    setAbBusy(true);

    const runOne = async (
      detector: "firearm_onnx" | "firearm_yolox",
    ): Promise<GunAbDetectorCell> => {
      try {
        const response =
          detector === "firearm_onnx"
            ? await detectFirearmOnnxFrame(dataUrl)
            : await detectFirearmYoloxFrame(dataUrl);
        const top = topFirearmHit(response.detections);
        // Per-model thresholds — never share Subh775 0.65 with YOLOX 0.02.
        const thr =
          typeof response.conf_threshold === "number"
            ? response.conf_threshold
            : detector === "firearm_yolox"
              ? 0.02
              : 0.65;
        const rawScore =
          "top_score" in response && typeof response.top_score === "number"
            ? response.top_score
            : (top?.score ?? null);
        const isGun = Boolean(
          (rawScore !== null && rawScore >= thr) || (top && top.score >= thr),
        );
        return {
          detector,
          pred: isGun ? "gun" : "miss",
          label: isGun ? (top?.label ?? "gun") : null,
          score: rawScore,
          box: isGun && top?.box ? top.box : null,
          latencyMs: response.inference_ms,
          error: null,
        };
      } catch (error: unknown) {
        return {
          detector,
          pred: "miss",
          label: null,
          score: null,
          box: null,
          latencyMs: null,
          error: error instanceof Error ? error.message : "detect_failed",
        };
      }
    };

    try {
      const [firearmOnnx, firearmYolox] = await Promise.all([
        runOne("firearm_onnx"),
        runOne("firearm_yolox"),
      ]);
      setAbRows((prev) =>
        [
          {
            atMs: Date.now(),
            frameId: abPreset.id,
            frameLabel: abPreset.label,
            expected: resolved.expected,
            expectedSource: resolved.expectedSource,
            videoId: fileName,
            videoTimeSec,
            firearmOnnx,
            firearmYolox,
          },
          ...prev,
        ].slice(0, 30),
      );
    } finally {
      setAbBusy(false);
    }
  };

  const bindVideoSource = useCallback(
    (url: string) => {
      const video = videoRef.current;
      const source = frameSourceRef.current;
      if (!video || !source) {
        return;
      }
      video.src = url;
      video.load();
      source.start(video);
      setHasVideo(true);
      setIsPlaying(false);
      setSimulatedTerminated(false);
      setSimEvents([]);
      bumpReset();
    },
    [bumpReset],
  );

  const handleChooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !isAcceptedVideoFile(file)) {
      return;
    }
    revokeVideoObjectUrl(objectUrlRef.current);
    const url = createVideoObjectUrl(file);
    objectUrlRef.current = url;
    setFileName(file.name);
    bindVideoSource(url);
  };

  const handlePlayPause = async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (video.paused) {
      await video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleRestart = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.currentTime = 0;
    setSimulatedTerminated(false);
    setSimEvents([]);
    bumpReset();
    void video.play().then(() => setIsPlaying(true));
  };

  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const next = Number(event.target.value);
    video.currentTime = next;
    setCurrentTime(next);
    setSimulatedTerminated(false);
    bumpReset();
  };

  const cocoOverlaySnapshot = {
    ...objectDetector.snapshot,
    // Show raw COCO labels (person/knife/…) not only product allowlist.
    detections: objectDetector.snapshot.allDetections,
  };

  const gunStateLabel =
    weaponGate.result.state === "confirmed_risk"
      ? "CONFIRMED_RISK"
      : weaponGate.result.state === "warning"
        ? "WARNING"
        : "SCANNING";

  const sharpLabel =
    simulatedTerminated || sharp.result.action === "terminate"
      ? "CONFIRMED"
      : sharp.result.action === "warning"
        ? "WARNING"
        : "SAFE";

  const adultLabel = !adultGate.uiEnabled
    ? "UNAVAILABLE"
    : adultGate.backendEnabled === false
      ? "UNAVAILABLE"
      : adultGate.result.state;

  return (
    <main className="cvTestPage">
      <header className="cvTestHeader">
        <div>
          <p className="cvTestEyebrow">DEV / local only</p>
          <h1>CV Test Video</h1>
          <p className="cvTestBanner">
            TEST MODE — moderation actions are simulated (no real session terminate)
          </p>
        </div>
        <button type="button" className="liveRoomsRefreshButton" onClick={() => navigateHash(roomsPath())}>
          Back to rooms
        </button>
      </header>

      <section className="cvTestControls">
        <label className="cvTestFileButton">
          Choose Video
          <input type="file" accept="video/*" onChange={handleChooseFile} />
        </label>
        {fileName ? <span className="cvTestFileName">{fileName}</span> : null}
        <button type="button" className="liveRoomsRefreshButton" disabled={!hasVideo} onClick={() => void handlePlayPause()}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button type="button" className="liveRoomsRefreshButton" disabled={!hasVideo} onClick={handleRestart}>
          Restart
        </button>
      </section>

      <div className="cvTestStageWrap">
        <video
          ref={videoRef}
          className="cvTestHiddenVideo"
          playsInline
          muted
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onLoadedMetadata={(event) => {
            setDuration(event.currentTarget.duration || 0);
            frameSourceRef.current?.paintOnce();
          }}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
          onSeeked={() => {
            frameSourceRef.current?.paintOnce();
          }}
        />
        <div className="cvTestStage">
          <canvas
            ref={canvasRef}
            width={CAPTURE_WIDTH}
            height={CAPTURE_HEIGHT}
            className="cvTestCanvas"
          />
          <ObjectDetectorOverlay
            enabled={objectDetector.isActive}
            snapshot={cocoOverlaySnapshot}
            getSourceCanvas={getCanvasElement}
          />
          <WeaponDetectorOverlay
            enabled={weaponGate.lastDetections.length > 0}
            detections={weaponGate.lastDetections}
            getSourceCanvas={getCanvasElement}
          />
          {!hasVideo ? <div className="cvTestPlaceholder">Choose a local video to begin</div> : null}
        </div>
      </div>

      <div className="cvTestTimeline">
        <span>
          Time: {formatVideoClock(currentTime)} / {formatVideoClock(duration)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.05}
          value={currentTime}
          disabled={!hasVideo}
          onChange={handleSeek}
        />
      </div>

      <section className="cvTestDevControls">
        <div className="cvTestBackendToggle" role="group" aria-label="Gun detector">
          <span>Gun detector:</span>
          <button
            type="button"
            className={gunBackend === "grounding_dino" ? "liveRoomsCreateButton" : "liveRoomsRefreshButton"}
            onClick={() => selectGunBackend("grounding_dino")}
          >
            Grounding DINO
          </button>
          <button
            type="button"
            className={gunBackend === "firearm_onnx" ? "liveRoomsCreateButton" : "liveRoomsRefreshButton"}
            onClick={() => selectGunBackend("firearm_onnx")}
          >
            Subh775 ONNX
          </button>
          <button
            type="button"
            className={gunBackend === "firearm_yolox" ? "liveRoomsCreateButton" : "liveRoomsRefreshButton"}
            onClick={() => selectGunBackend("firearm_yolox")}
          >
            Custom Firearm YOLOX
          </button>
        </div>
        {gunBackend === "grounding_dino" ? (
          <label>
            Gun scan interval (sec)
            <input
              type="number"
              min={5}
              max={60}
              value={Math.round(gunIntervalMs / 1000)}
              onChange={(event) => {
                const sec = Math.max(5, Math.floor(Number(event.target.value) || 10));
                setGunIntervalMs(sec * 1000);
              }}
            />
          </label>
        ) : (
          <label>
            Detector auto sample (FPS)
            <select
              value={onnxFps}
              onChange={(event) => {
                const fps = Number(event.target.value) === 2 ? 2 : 1;
                setOnnxFps(fps);
                setGunIntervalMs(Math.round(1000 / fps));
                bumpReset();
              }}
            >
              <option value={1}>1 FPS</option>
              <option value={2}>2 FPS</option>
            </select>
          </label>
        )}
        <button
          type="button"
          className="liveRoomsCreateButton"
          disabled={!hasVideo || weaponGate.inFlight}
          onClick={() => void weaponGate.scanCurrentFrame()}
        >
          Scan current frame now (active backend)
        </button>
        <button
          type="button"
          className="liveRoomsCreateButton"
          disabled={!hasVideo || adultGate.inFlight}
          onClick={() => void adultGate.analyzeCurrentFrame()}
        >
          Analyze current frame (Adult)
        </button>
        <button
          type="button"
          className="liveRoomsRefreshButton"
          disabled={!simulatedTerminated}
          onClick={() => {
            setSimulatedTerminated(false);
            bumpReset();
          }}
        >
          Clear simulated terminate
        </button>
      </section>

      <section className="cvTestAbPanel">
        <h2>Gun A/B (same paused frame)</h2>
        <p className="cvTestMeta">
          Candidate: Subh775/Firearm_Detection_Yolov8n → ONNX Runtime (no ultralytics at inference).
          HF card license: AGPL-3.0. DINO kept for comparison.
        </p>
        <div className="cvTestDevControls">
          <label>
            Frame preset
            <select
              value={abPresetId}
              onChange={(event) => {
                setAbPresetId(event.target.value);
                setAbManualExpected("");
                setAbLabelError(null);
              }}
            >
              {GUN_AB_FRAME_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="liveRoomsRefreshButton"
            disabled={!hasVideo || abPreset.seekSec === undefined}
            onClick={() => {
              const video = videoRef.current;
              if (!video || abPreset.seekSec === undefined) {
                return;
              }
              video.pause();
              video.currentTime = abPreset.seekSec;
              setIsPlaying(false);
              setCurrentTime(abPreset.seekSec);
              setAbManualExpected("");
              setAbLabelError(null);
              bumpReset();
            }}
          >
            Seek preset time
          </button>
          <label>
            Expected (current frame)
            <select
              value={abManualExpected}
              onChange={(event) => {
                setAbManualExpected(event.target.value as GunAbExpected | "");
                setAbLabelError(null);
              }}
            >
              <option value="">
                {abPreset.seekSec !== undefined
                  ? "(auto if timestamp matches preset)"
                  : "(required — pick for current frame)"}
              </option>
              <option value="gun_present">gun_present</option>
              <option value="no_gun">no_gun</option>
              <option value="benign_human">benign_human</option>
              <option value="hard_neg_drill">hard_neg_drill</option>
              <option value="hard_neg_banana">hard_neg_banana</option>
              <option value="hard_neg_tool">hard_neg_tool</option>
            </select>
          </label>
          <button
            type="button"
            className="liveRoomsCreateButton"
            disabled={!hasVideo || abBusy}
            onClick={() => void runAbCompare()}
          >
            {abBusy ? "Comparing…" : "Compare Subh775 vs Custom YOLOX"}
          </button>
          <button
            type="button"
            className="liveRoomsRefreshButton"
            disabled={abRows.length === 0}
            onClick={() => setAbRows([])}
          >
            Clear A/B table
          </button>
          <button
            type="button"
            className="liveRoomsRefreshButton"
            disabled={abRows.length === 0}
            onClick={() => {
              const lines = abRows.flatMap((row) =>
                (
                  [
                    ["firearm_onnx", row.firearmOnnx],
                    ["firearm_yolox", row.firearmYolox],
                  ] as const
                ).map(([model, cell]) =>
                  JSON.stringify({
                    video_id: row.videoId,
                    timestamp_sec: row.videoTimeSec,
                    frame_id: row.frameId,
                    expected: row.expected,
                    expected_source: row.expectedSource,
                    model,
                    prediction: cell.pred,
                    score: cell.score,
                    latency_ms: cell.latencyMs,
                    bbox_count: cell.box ? 1 : 0,
                    box: cell.box,
                    error: cell.error,
                  }),
                ),
              );
              const blob = new Blob([`${lines.join("\n")}\n`], { type: "application/x-ndjson" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = `firearm-ab-${Date.now()}.jsonl`;
              anchor.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export A/B JSONL
          </button>
        </div>
        <p className="cvTestMeta">{abPreset.hint}</p>
        {abLabelError ? <p className="error">{abLabelError}</p> : null}
        <p className="cvTestState">
          Decision: {abDecision.decision}
        </p>
        <p className="cvTestMeta">{abDecision.reason}</p>
        <div className="cvTestAbTableWrap">
          <table className="cvTestAbTable">
            <thead>
              <tr>
                <th>Frame</th>
                <th>Expected</th>
                <th>Subh775 pred/score/latency</th>
                <th>Custom YOLOX pred/score/latency</th>
              </tr>
            </thead>
            <tbody>
              {abRows.length === 0 ? (
                <tr>
                  <td colSpan={4}>No comparisons yet — pause a preset frame and compare.</td>
                </tr>
              ) : (
                abRows.map((row) => (
                  <tr key={`${row.atMs}-${row.frameId}`}>
                    <td>
                      {row.frameLabel}
                      {row.videoTimeSec !== null
                        ? ` @ ${formatVideoClock(row.videoTimeSec)}`
                        : ""}
                    </td>
                    <td>
                      {row.expected}
                      <div className="cvTestMeta">
                        {row.expectedSource}
                        {row.videoTimeSec !== null
                          ? ` · t=${row.videoTimeSec.toFixed(1)}s`
                          : ""}
                      </div>
                    </td>
                    <td>
                      {formatAbPred(row.firearmOnnx)} / {formatAbLatency(row.firearmOnnx.latencyMs)}
                      {row.firearmOnnx.error ? ` (${row.firearmOnnx.error})` : ""}
                      {row.firearmOnnx.box
                        ? ` · box[${row.firearmOnnx.box.map((v) => v.toFixed(0)).join(",")}]`
                        : ""}
                    </td>
                    <td>
                      {formatAbPred(row.firearmYolox)} / {formatAbLatency(row.firearmYolox.latencyMs)}
                      {row.firearmYolox.error ? ` (${row.firearmYolox.error})` : ""}
                      {row.firearmYolox.box
                        ? ` · box[${row.firearmYolox.box.map((v) => v.toFixed(0)).join(",")}]`
                        : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="cvTestPanels">
        <section className="cvTestPanel">
          <h2>COCO OBJECTS</h2>
          <p className="cvTestMeta">
            engine: {objectDetector.status} · raw hits:{" "}
            {objectDetector.snapshot.allDetections.length}
            {" "}(COCO has no gun class — rifles may show as train/etc.)
          </p>
          <ul>
            {objectDetector.snapshot.allDetections.length === 0 ? (
              <li>—</li>
            ) : (
              objectDetector.snapshot.allDetections.map((hit, index) => (
                <li key={`${hit.label}-${index}`}>
                  {hit.label} {hit.score.toFixed(2)}
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="cvTestPanel">
          <h2>SHARP OBJECT</h2>
          <p className="cvTestState">{sharpLabel}</p>
          <p className="cvTestMeta">
            evidence {sharp.result.evidenceCount}/{sharp.result.requiredHits}
            {sharp.result.label ? ` · ${sharp.result.label}` : ""}
          </p>
        </section>

        <section className="cvTestPanel">
          <h2>GUN / FIREARM</h2>
          <p className="cvTestState">State: {gunStateLabel}</p>
          <p className="cvTestMeta">
            active:{" "}
            {gunBackend === "firearm_onnx"
              ? "Subh775 ONNX"
              : gunBackend === "firearm_yolox"
                ? "Custom YOLOX"
                : "Grounding DINO"}{" "}
            · warning /
            confirmed_risk only (no auto-terminate)
          </p>
          <p className="cvTestMeta">
            raw score {weaponGate.lastRawScore?.toFixed(3) ?? "—"} · threshold ≥
            {weaponGate.lastConfThreshold?.toFixed(2) ??
              (gunBackend === "firearm_yolox"
                ? "0.02"
                : gunBackend === "firearm_onnx"
                  ? "0.65"
                  : "0.42")}{" "}
            · temporal hits {weaponGate.result.evidenceCount}/
            {weaponGate.result.requiredHits}
          </p>
          <p className="cvTestMeta">
            {gunBackend === "firearm_yolox"
              ? `YOLOX-Nano ONNX · thr 0.02 · ${onnxFps} FPS · 1 hit=WARNING · 2 hits=CONFIRMED_RISK`
              : gunBackend === "firearm_onnx"
                ? `YOLOv8n ONNX · thr 0.65 · ${onnxFps} FPS · 1 hit=WARNING · 2 hits=CONFIRMED_RISK`
                : "tiny DINO · thr 0.42 · ~10s/sample (CPU ~8–12s)"}
          </p>
          <p className="cvTestMeta">
            latency {weaponGate.lastInferenceMs?.toFixed(0) ?? "—"} ms · skipped{" "}
            {weaponGate.skippedBusyCount} · samples {weaponGate.completedSamples}
          </p>
          <ul>
            {weaponGate.lastDetections.length === 0 ? (
              <li>No gun-family boxes (raw/backend list empty or below display)</li>
            ) : (
              weaponGate.lastDetections.slice(0, 5).map((det, index) => {
                const thr =
                  gunBackend === "firearm_yolox"
                    ? 0.02
                    : gunBackend === "firearm_onnx"
                      ? 0.65
                      : 0.42;
                return (
                  <li key={`${det.label}-${index}`}>
                    {det.label} raw {det.score.toFixed(3)}
                    {det.score < thr ? " (below thr)" : ""}
                  </li>
                );
              })
            )}
          </ul>
        </section>

        <section className="cvTestPanel">
          <h2>ADULT MODERATION</h2>
          <p className="cvTestState">State: {adultLabel}</p>
          <p className="cvTestMeta">
            enabled={String(adultGate.backendEnabled)} · ready={String(adultGate.ready)} ·
            temporal samples {adultGate.result.evidenceCount} (SUG≥
            {adultGate.result.requiredHits}, EXP≥3)
          </p>
          <p className="cvTestMeta">
            safe {adultGate.lastClassify?.suggestive.scores?.safe?.toFixed(3) ?? "—"} · sexy{" "}
            {adultGate.lastClassify?.suggestive.scores?.sexy?.toFixed(3) ?? "—"} · porn{" "}
            {adultGate.lastClassify?.suggestive.scores?.porn?.toFixed(3) ?? "—"} · hentai{" "}
            {adultGate.lastClassify?.suggestive.scores?.hentai?.toFixed(3) ?? "—"}
          </p>
          <p className="cvTestMeta">
            Falconsai nsfw {adultGate.lastClassify?.falconsai.nsfw_score?.toFixed(3) ?? "—"} ·
            normal {adultGate.lastClassify?.falconsai.normal_score?.toFixed(3) ?? "—"} · lat sug{" "}
            {adultGate.lastClassify?.suggestive.inference_ms?.toFixed(0) ?? "—"} / falc{" "}
            {adultGate.lastClassify?.falconsai.inference_ms?.toFixed(0) ?? "—"} ms
          </p>
          <p className="cvTestMeta">
            Final state: {adultGate.result.state} (frame {adultGate.lastFrameState ?? "—"}) ·
            reason {adultGate.lastClassify?.reason ?? "—"}
          </p>
          <p className="cvTestMeta">No auto-terminate for adult content in this slice.</p>
        </section>

        <section className="cvTestPanel">
          <h2>Moderation</h2>
          <p className="cvTestMeta">warning only / terminate condition (simulated)</p>
          <p className="cvTestMeta">visual: {visualModeration.status}</p>
          <ul>
            {simEvents.length === 0 ? (
              <li>No WOULD_TERMINATE yet</li>
            ) : (
              simEvents.map((event) => (
                <li key={`${event.atMs}-${event.label}`}>{formatSimulatedEvent(event)}</li>
              ))
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}
