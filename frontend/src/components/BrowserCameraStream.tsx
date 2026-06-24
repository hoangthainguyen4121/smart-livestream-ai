/** @deprecated Legacy browser camera — POST /api/inference/frame. Main demo uses Browser AR (features/browser-ar). */
import { useEffect, useRef, useState } from "react";

import {
  type GestureDebugInfo,
  type InferenceFrameResponse,
  resetInferenceState,
  submitInferenceFrame,
} from "../api/inference";
import { FaceLabelTracker } from "../utils/faceLabelTracker";
import {
  type CaptureLayout,
  type DisplayFace,
  type DisplayLabelAnchor,
  computeCaptureLayout,
  computeVideoDisplayLayout,
  mapFacesToDisplay,
} from "../utils/overlayMapping";


const CAPTURE_WIDTH = 640;
const CAPTURE_HEIGHT = 480;
const CAPTURE_JPEG_QUALITY = 0.82;
const IDENTITY_INFERENCE_FPS = 3;
const SYNCED_INFERENCE_FPS = 5;
const INFERENCE_TIMEOUT_MS = 15000;
const GESTURE_OVERLAY_HOLD_MS = 1200;
const MAX_IN_FLIGHT_REQUESTS = 1;


type PreviewMode = "realtime" | "synced";

type BrowserCameraStreamProps = {
  isLive: boolean;
};

type CapturedFrame = {
  payload: string;
  frameId: number;
  sentAt: number;
  captureLayout: CaptureLayout;
};

type StreamDebugStats = {
  captureResolution: string;
  displayResolution: string;
  processingMs: number;
  frameAgeMs: number;
  frameId: number;
  previewMode: PreviewMode;
  identityTargetFps: number;
  identityActualFps: number;
  identitySimilarity: number | null;
  identityUsername: string | null;
  responseAgeMs: number;
  inFlightCount: number;
  staleCount: number;
};

type InferenceRuntimeMetrics = {
  identityTargetFps: number;
  identityActualFps: number;
  responseAgeMs: number;
  inFlightCount: number;
  staleCount: number;
};

type RealtimeOverlayState = {
  captureLayout: CaptureLayout;
  result: InferenceFrameResponse;
  receivedAt: number;
  sentAt: number;
  frameId: number;
  gestureLabels: string[];
  gestureDebug: GestureDebugInfo[];
};


export function BrowserCameraStream({ isLive }: BrowserCameraStreamProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const latestAcceptedFrameIdRef = useRef(0);
  const realtimeOverlayRef = useRef<RealtimeOverlayState | null>(null);
  const faceLabelTrackerRef = useRef(new FaceLabelTracker());
  const debugOverlayRef = useRef(false);
  const lastSyncedFrameRef = useRef<{
    captured: CapturedFrame;
    result: InferenceFrameResponse;
    frameAgeMs: number;
  } | null>(null);
  const inferenceFpsRef = useRef(0);
  const inferenceTargetFpsRef = useRef(IDENTITY_INFERENCE_FPS);
  const inferenceRuntimeRef = useRef<InferenceRuntimeMetrics>({
    identityTargetFps: IDENTITY_INFERENCE_FPS,
    identityActualFps: 0,
    responseAgeMs: 0,
    inFlightCount: 0,
    staleCount: 0,
  });

  const [previewMode, setPreviewMode] = useState<PreviewMode>("realtime");
  const [debugOverlay, setDebugOverlay] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [inferenceResult, setInferenceResult] = useState<InferenceFrameResponse | null>(null);
  const [inferenceFps, setInferenceFps] = useState(0);
  const [identityTargetFps, setIdentityTargetFps] = useState(IDENTITY_INFERENCE_FPS);
  const [debugStats, setDebugStats] = useState<StreamDebugStats | null>(null);

  const activeInferenceFps =
    previewMode === "realtime" ? identityTargetFps : SYNCED_INFERENCE_FPS;

  useEffect(() => {
    debugOverlayRef.current = debugOverlay;
  }, [debugOverlay]);

  useEffect(() => {
    if (!isLive) {
      stopCamera();
      void resetInferenceState().catch(() => undefined);
      resetStreamState();
      return;
    }

    let cancelled = false;
    let captureTimerId: number | undefined;
    let syncedLoopTimerId: number | undefined;
    let overlayFrameId: number | undefined;
    let frameCounter = 0;
    let inFlightRequests = 0;
    let pendingCapture: CapturedFrame | null = null;
    let identityTargetFpsLocal = IDENTITY_INFERENCE_FPS;
    let staleCount = 0;
    let completedRequestCount = 0;
    let requestWindowStartedAt = performance.now();
    let resizeObserver: ResizeObserver | undefined;

    function recordCompletedRequest() {
      completedRequestCount += 1;
      const elapsedMs = performance.now() - requestWindowStartedAt;
      if (elapsedMs >= 1000) {
        inferenceRuntimeRef.current.identityActualFps =
          (completedRequestCount * 1000) / elapsedMs;
        completedRequestCount = 0;
        requestWindowStartedAt = performance.now();
      }
    }

    function syncInferenceRuntimeMetrics(responseAgeMs: number) {
      inferenceRuntimeRef.current = {
        identityTargetFps: identityTargetFpsLocal,
        identityActualFps: inferenceRuntimeRef.current.identityActualFps,
        responseAgeMs,
        inFlightCount: inFlightRequests,
        staleCount,
      };
    }

    async function start() {
      setErrorMessage(null);
      setWarningMessage(null);
      setIsCameraReady(false);
      latestAcceptedFrameIdRef.current = 0;
      realtimeOverlayRef.current = null;
      faceLabelTrackerRef.current.reset();

      try {
        await startCamera();
        if (cancelled) {
          return;
        }

        const resizeTarget =
          previewMode === "realtime" ? videoRef.current : displayCanvasRef.current;
        resizeObserver = new ResizeObserver(() => {
          syncOverlayCanvasSize();
          const lastSynced = lastSyncedFrameRef.current;
          if (previewMode === "synced" && lastSynced) {
            renderSyncedFrame(
              lastSynced.captured,
              lastSynced.result,
              lastSynced.frameAgeMs,
            );
          }
        });
        if (resizeTarget) {
          resizeObserver.observe(resizeTarget);
        }

        if (previewMode === "realtime") {
          syncOverlayCanvasSize();
          startOverlayAnimationLoop();
          startRealtimeCaptureLoop();
        } else {
          runSyncedInferenceLoop();
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(formatCameraError(error));
        }
      }
    }

    function startRealtimeCaptureLoop() {
      const scheduleNextCapture = () => {
        if (cancelled) {
          return;
        }

        captureTimerId = window.setTimeout(
          captureTick,
          Math.max(1000 / identityTargetFpsLocal, 200),
        );
      };

      const captureTick = () => {
        if (cancelled) {
          return;
        }

        const captured = captureFrame(++frameCounter);
        if (!captured) {
          scheduleNextCapture();
          return;
        }

        if (inFlightRequests >= MAX_IN_FLIGHT_REQUESTS) {
          pendingCapture = captured;
          scheduleNextCapture();
          return;
        }

        void sendCapture(captured);
        scheduleNextCapture();
      };

      const sendCapture = async (captured: CapturedFrame) => {
        inFlightRequests = 1;
        syncInferenceRuntimeMetrics(performance.now() - captured.sentAt);

        try {
          const result = await submitInferenceFrame(captured.payload, {
            frameId: captured.frameId,
            sentAtMs: captured.sentAt,
            timeoutMs: INFERENCE_TIMEOUT_MS,
          });
          if (cancelled) {
            return;
          }

          if (
            captured.frameId < latestAcceptedFrameIdRef.current ||
            (result.frame_id != null && result.frame_id < latestAcceptedFrameIdRef.current)
          ) {
            staleCount += 1;
            inferenceRuntimeRef.current.staleCount = staleCount;
            return;
          }

          latestAcceptedFrameIdRef.current = captured.frameId;
          const receivedAt = performance.now();
          acceptIdentityResult(captured, result, receivedAt);
          recordCompletedRequest();
          inferenceFpsRef.current = inferenceRuntimeRef.current.identityActualFps;
          setInferenceFps(inferenceRuntimeRef.current.identityActualFps);
          syncInferenceRuntimeMetrics(receivedAt - captured.sentAt);
        } catch (error) {
          if (!cancelled) {
            setWarningMessage(
              error instanceof Error ? error.message : "Inference request failed.",
            );
          }
        } finally {
          inFlightRequests = 0;
          syncInferenceRuntimeMetrics(
            pendingCapture
              ? performance.now() - pendingCapture.sentAt
              : inferenceRuntimeRef.current.responseAgeMs,
          );

          if (pendingCapture && !cancelled) {
            const latestPending = pendingCapture;
            pendingCapture = null;
            void sendCapture(latestPending);
          }
        }
      };

      captureTick();
    }

    async function runSyncedInferenceLoop() {
      if (cancelled) {
        return;
      }

      const frameIntervalMs = Math.max(1000 / SYNCED_INFERENCE_FPS, 100);
      const loopStartedAt = performance.now();
      const frameId = ++frameCounter;
      const captured = captureFrame(frameId);

      if (captured) {
        try {
          const result = await submitInferenceFrame(captured.payload, {
            frameId: captured.frameId,
            sentAtMs: captured.sentAt,
            timeoutMs: INFERENCE_TIMEOUT_MS,
          });
          if (cancelled) {
            return;
          }

          if (frameId < latestAcceptedFrameIdRef.current) {
            scheduleSyncedLoop(loopStartedAt, frameIntervalMs);
            return;
          }

          latestAcceptedFrameIdRef.current = frameId;
          setInferenceResult(result);
          setWarningMessage(null);
          const frameAgeMs = performance.now() - captured.sentAt;
          renderSyncedFrame(captured, result, frameAgeMs);

          const elapsedMs = performance.now() - loopStartedAt;
          inferenceFpsRef.current = elapsedMs > 0 ? 1000 / elapsedMs : 0;
          setInferenceFps(inferenceFpsRef.current);
        } catch (error) {
          if (!cancelled) {
            setWarningMessage(
              error instanceof Error ? error.message : "Inference request failed.",
            );
          }
        }
      }

      scheduleSyncedLoop(loopStartedAt, frameIntervalMs);
    }

    function scheduleSyncedLoop(loopStartedAt: number, frameIntervalMs: number) {
      if (cancelled) {
        return;
      }

      const elapsedMs = performance.now() - loopStartedAt;
      const delayMs = Math.max(0, frameIntervalMs - elapsedMs);
      syncedLoopTimerId = window.setTimeout(runSyncedInferenceLoop, delayMs);
    }

    function startOverlayAnimationLoop() {
      const tick = (now: number) => {
        if (cancelled) {
          return;
        }

        drawRealtimeOverlay(now);
        overlayFrameId = window.requestAnimationFrame(tick);
      };

      overlayFrameId = window.requestAnimationFrame(tick);
    }

    function acceptIdentityResult(
      captured: CapturedFrame,
      result: InferenceFrameResponse,
      receivedAt: number,
    ) {
      const video = videoRef.current;
      if (!video) {
        return;
      }

      const displayLayout = computeVideoDisplayLayout(video);
      if (!displayLayout) {
        return;
      }

      const backendFaces = mapFacesToDisplay(
        result.faces,
        captured.captureLayout,
        displayLayout,
      );
      faceLabelTrackerRef.current.applyIdentity(backendFaces, receivedAt);
      faceLabelTrackerRef.current.applyBackendFallbackPosition(backendFaces, receivedAt);

      realtimeOverlayRef.current = {
        captureLayout: captured.captureLayout,
        result,
        receivedAt,
        sentAt: captured.sentAt,
        frameId: captured.frameId,
        gestureLabels: filterGestureLabels(result.gesture_labels),
        gestureDebug: (result.gesture_debug ?? []).filter(
          (entry) => entry.detected_gesture !== "Wave",
        ),
      };
      setInferenceResult(result);
      setWarningMessage(null);
      if (debugOverlayRef.current) {
        const runtime = inferenceRuntimeRef.current;
        const trackerDebug = faceLabelTrackerRef.current.getDebugSnapshot();
        setDebugStats({
          captureResolution: `${result.frame_width}x${result.frame_height}`,
          displayResolution: `${displayLayout.elementWidth}x${Math.round(displayLayout.elementHeight)}`,
          processingMs: result.processing_ms,
          frameAgeMs: receivedAt - captured.sentAt,
          frameId: captured.frameId,
          previewMode: "realtime",
          identityTargetFps: runtime.identityTargetFps,
          identityActualFps: runtime.identityActualFps,
          identitySimilarity: trackerDebug.identitySimilarity,
          identityUsername: trackerDebug.identityUsername,
          responseAgeMs: runtime.responseAgeMs,
          inFlightCount: runtime.inFlightCount,
          staleCount: runtime.staleCount,
        });
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (captureTimerId !== undefined) {
        window.clearTimeout(captureTimerId);
      }
      if (syncedLoopTimerId !== undefined) {
        window.clearTimeout(syncedLoopTimerId);
      }
      if (overlayFrameId !== undefined) {
        window.cancelAnimationFrame(overlayFrameId);
      }
      resizeObserver?.disconnect();
      stopCamera();
      void resetInferenceState().catch(() => undefined);
    };
  }, [isLive, previewMode]);

  function resetStreamState() {
    latestAcceptedFrameIdRef.current = 0;
    realtimeOverlayRef.current = null;
    faceLabelTrackerRef.current.reset();
    lastSyncedFrameRef.current = null;
    inferenceFpsRef.current = 0;
    inferenceTargetFpsRef.current = IDENTITY_INFERENCE_FPS;
    inferenceRuntimeRef.current = {
      identityTargetFps: IDENTITY_INFERENCE_FPS,
      identityActualFps: 0,
      responseAgeMs: 0,
      inFlightCount: 0,
      staleCount: 0,
    };
    setInferenceResult(null);
    setInferenceFps(0);
    setIdentityTargetFps(IDENTITY_INFERENCE_FPS);
    setDebugStats(null);
    setWarningMessage(null);
    clearCanvas(displayCanvasRef.current);
    clearCanvas(overlayCanvasRef.current);
  }

  function syncOverlayCanvasSize() {
    const video = videoRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!video || !overlayCanvas) {
      return;
    }

    overlayCanvas.width = Math.max(1, Math.round(video.clientWidth));
    overlayCanvas.height = Math.max(1, Math.round(video.clientHeight));
  }

  function clearCanvas(canvas: HTMLCanvasElement | null) {
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  function drawRealtimeOverlay(now: number) {
    const video = videoRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!video || !overlayCanvas || video.videoWidth === 0) {
      return;
    }

    const context = overlayCanvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    const displayLayout = computeVideoDisplayLayout(video);
    const anchors = faceLabelTrackerRef.current.tick(now);
    const overlayState = realtimeOverlayRef.current;
    const runtime = inferenceRuntimeRef.current;
    runtime.responseAgeMs = overlayState ? now - overlayState.sentAt : 0;
    const showGestures = overlayState
      ? now - overlayState.receivedAt <= GESTURE_OVERLAY_HOLD_MS
      : false;

    if (debugOverlayRef.current) {
      if (overlayState && displayLayout) {
        const backendFaces = mapFacesToDisplay(
          overlayState.result.faces,
          overlayState.captureLayout,
          displayLayout,
        );
        drawFaceBoxes(context, backendFaces, true);
      }
    }

    for (const anchor of anchors) {
      drawFloatingNameLabel(context, anchor, anchor.label === "Detecting...");
    }

    if (overlayState && showGestures) {
      drawGestureBadges(context, overlayState.gestureLabels, anchors[0]);
    }

    if (debugOverlayRef.current) {
      const trackerDebug = faceLabelTrackerRef.current.getDebugSnapshot();
      drawDebugFooter(context, {
        frameId: overlayState?.frameId ?? 0,
        captureResolution: overlayState
          ? `${overlayState.result.frame_width}x${overlayState.result.frame_height}`
          : `${video.videoWidth}x${video.videoHeight}`,
        displayResolution: `${overlayCanvas.width}x${overlayCanvas.height}`,
        processingMs: overlayState?.result.processing_ms ?? 0,
        frameAgeMs: overlayState ? now - overlayState.sentAt : 0,
        previewLabel: "Browser fallback debug",
        identityTargetFps: runtime.identityTargetFps,
        identityActualFps: runtime.identityActualFps,
        identitySimilarity: trackerDebug.identitySimilarity,
        identityUsername: trackerDebug.identityUsername,
        responseAgeMs: runtime.responseAgeMs,
        inFlightCount: runtime.inFlightCount,
        staleCount: runtime.staleCount,
      });
      if (overlayState) {
        drawGestureDebugLines(context, overlayState.gestureDebug);
      }
    }
  }

  function renderSyncedFrame(
    captured: CapturedFrame,
    result: InferenceFrameResponse,
    frameAgeMs: number,
  ) {
    const captureCanvas = captureCanvasRef.current;
    const displayCanvas = displayCanvasRef.current;
    if (!captureCanvas || !displayCanvas) {
      return;
    }

    displayCanvas.width = result.frame_width;
    displayCanvas.height = result.frame_height;
    const context = displayCanvas.getContext("2d");
    if (!context) {
      return;
    }

    context.drawImage(captureCanvas, 0, 0, result.frame_width, result.frame_height);

    for (const face of result.faces) {
      drawFaceBox(context, face.bbox, face.label, face.is_known, face.similarity, true);
    }

    drawGestureLabels(context, filterGestureLabels(result.gesture_labels));
    drawDebugFooter(context, {
      frameId: captured.frameId,
      captureResolution: `${result.frame_width}x${result.frame_height}`,
      displayResolution: `${displayCanvas.clientWidth}x${displayCanvas.clientHeight}`,
      processingMs: result.processing_ms,
      frameAgeMs,
      previewLabel: "Synced frame",
    });

    setDebugStats({
      captureResolution: `${result.frame_width}x${result.frame_height}`,
      displayResolution: `${displayCanvas.clientWidth}x${displayCanvas.clientHeight}`,
      processingMs: result.processing_ms,
      frameAgeMs,
      frameId: captured.frameId,
      previewMode: "synced",
      identityTargetFps: SYNCED_INFERENCE_FPS,
      identityActualFps: inferenceFpsRef.current,
      identitySimilarity: null,
      identityUsername: result.primary_username || null,
      responseAgeMs: frameAgeMs,
      inFlightCount: 0,
      staleCount: 0,
    });
    lastSyncedFrameRef.current = { captured, result, frameAgeMs };
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support camera access.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: CAPTURE_WIDTH },
        height: { ideal: CAPTURE_HEIGHT },
      },
      audio: false,
    });
    mediaStreamRef.current = stream;

    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      await video.play();
    }
  }

  function stopCamera() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setIsCameraReady(false);

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function captureFrame(frameId: number): CapturedFrame | null {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    const captureLayout = computeCaptureLayout(
      sourceWidth,
      sourceHeight,
      CAPTURE_WIDTH,
      CAPTURE_HEIGHT,
    );

    canvas.width = CAPTURE_WIDTH;
    canvas.height = CAPTURE_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    context.fillStyle = "#000000";
    context.fillRect(0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);
    context.drawImage(
      video,
      captureLayout.offsetX,
      captureLayout.offsetY,
      captureLayout.drawWidth,
      captureLayout.drawHeight,
    );

    return {
      payload: canvas.toDataURL("image/jpeg", CAPTURE_JPEG_QUALITY),
      frameId,
      sentAt: performance.now(),
      captureLayout,
    };
  }

  if (!isLive) {
    return (
      <div className="browserStreamPanel">
        <div className="previewModeToggle" aria-label="Browser preview mode">
          <button
            type="button"
            className={previewMode === "realtime" ? "active" : ""}
            onClick={() => setPreviewMode("realtime")}
          >
            Realtime Preview
          </button>
          <button
            type="button"
            className={previewMode === "synced" ? "active" : ""}
            onClick={() => setPreviewMode("synced")}
          >
            Synced AI Frame
          </button>
          <button
            type="button"
            className={debugOverlay ? "active" : ""}
            onClick={() => setDebugOverlay((value) => !value)}
          >
            Debug Overlay
          </button>
        </div>
        <div className="streamPlaceholder">Stream stopped. Click Start Stream.</div>
      </div>
    );
  }

  return (
    <div className="browserStreamPanel">
      <div className="previewModeToggle" aria-label="Browser preview mode">
        <button type="button" className={previewMode === "realtime" ? "active" : ""} disabled>
          Realtime Preview
        </button>
        <button type="button" className={previewMode === "synced" ? "active" : ""} disabled>
          Synced AI Frame
        </button>
        <button
          type="button"
          className={debugOverlay ? "active" : ""}
          onClick={() => {
            setDebugOverlay((value) => {
              const nextValue = !value;
              if (!nextValue) {
                setDebugStats(null);
              }
              return nextValue;
            });
          }}
        >
          Debug Overlay
        </button>
      </div>

      <div className="browserStreamFrame">
        {previewMode === "realtime" ? (
          <>
            <video
              ref={videoRef}
              className="video browserStreamVideo"
              autoPlay
              playsInline
              muted
              onLoadedMetadata={() => {
                setIsCameraReady(true);
                syncOverlayCanvasSize();
              }}
            />
            <canvas ref={overlayCanvasRef} className="browserStreamOverlay" />
          </>
        ) : (
          <>
            <canvas
              ref={displayCanvasRef}
              className="video browserStreamDisplay"
              width={CAPTURE_WIDTH}
              height={CAPTURE_HEIGHT}
            />
            <video
              ref={videoRef}
              className="hiddenVideo"
              autoPlay
              playsInline
              muted
              onLoadedMetadata={() => setIsCameraReady(true)}
            />
          </>
        )}
      </div>

      <div className="metricsRow">
        <span>
          {previewMode === "realtime"
            ? "Browser camera fallback (backend labels)"
            : "Synced inferred frame"}
        </span>
        <span>
          {previewMode === "realtime"
            ? `${identityTargetFps} FPS identity target`
            : `${activeInferenceFps} FPS inference target`}
        </span>
        <span>{isCameraReady ? "camera ready" : "camera starting"}</span>
        {inferenceResult ? <span>Primary: {inferenceResult.primary_username}</span> : null}
        {inferenceFps > 0 ? <span>Identity: {inferenceFps.toFixed(1)} FPS</span> : null}
        {debugOverlay && debugStats ? (
          <>
            <span>Capture: {debugStats.captureResolution}</span>
            <span>Display: {debugStats.displayResolution}</span>
            <span>Identity target: {debugStats.identityTargetFps} FPS</span>
            <span>Identity actual: {debugStats.identityActualFps.toFixed(1)} FPS</span>
            <span>Backend: {debugStats.processingMs.toFixed(0)} ms</span>
            <span>Response age: {debugStats.responseAgeMs.toFixed(0)} ms</span>
            <span>
              Identity: {debugStats.identityUsername ?? "none"}
              {debugStats.identitySimilarity !== null
                ? ` (${debugStats.identitySimilarity.toFixed(2)})`
                : ""}
            </span>
            <span>In-flight: {debugStats.inFlightCount}</span>
            <span>Stale: {debugStats.staleCount}</span>
            <span>Frame #{debugStats.frameId}</span>
          </>
        ) : null}
      </div>

      {errorMessage ? <div className="error">{errorMessage}</div> : null}
      {warningMessage ? <div className="warningNotice">{warningMessage}</div> : null}
      <canvas ref={captureCanvasRef} className="hiddenCanvas" />
    </div>
  );
}

function drawFaceBoxes(
  context: CanvasRenderingContext2D,
  faces: DisplayFace[],
  showConfidence: boolean,
) {
  for (const face of faces) {
    drawFaceBox(context, face.bbox, face.label, face.is_known, face.similarity, showConfidence);
  }
}

function drawFaceBox(
  context: CanvasRenderingContext2D,
  bbox: DisplayFace["bbox"],
  label: string,
  isKnown: boolean,
  similarity: number | null,
  showConfidence: boolean,
) {
  const color = isKnown ? "#00dc00" : "#ff2d2d";
  const x = bbox.x1;
  const y = bbox.y1;
  const width = bbox.x2 - bbox.x1;
  const height = bbox.y2 - bbox.y1;
  const text =
    showConfidence && isKnown && similarity !== null
      ? `${label} (${similarity.toFixed(2)})`
      : label;

  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(x, y, width, height);
  context.font = "600 14px Segoe UI, sans-serif";
  context.fillStyle = color;
  context.fillText(text, x, Math.max(18, y - 8));
}

function drawFloatingNameLabel(
  context: CanvasRenderingContext2D,
  anchor: DisplayLabelAnchor,
  isDetecting = false,
) {
  const text = anchor.label;
  const font = "700 15px Segoe UI, sans-serif";
  context.font = font;
  const paddingX = 12;
  const badgeHeight = 30;
  const textWidth = context.measureText(text).width;
  const badgeWidth = textWidth + paddingX * 2;
  const x = clamp(
    anchor.x - badgeWidth / 2,
    8,
    context.canvas.width - badgeWidth - 8,
  );
  const y = clamp(anchor.y - badgeHeight, 8, context.canvas.height - badgeHeight - 8);

  context.fillStyle = isDetecting
    ? "rgba(23, 32, 51, 0.72)"
    : "rgba(23, 32, 51, 0.84)";
  roundRect(context, x, y, badgeWidth, badgeHeight, 999);
  context.fill();

  context.fillStyle = isDetecting ? "#dbeafe" : "#ffffff";
  context.textBaseline = "middle";
  context.fillText(text, x + paddingX, y + badgeHeight / 2);
  context.textBaseline = "alphabetic";
}

function filterGestureLabels(labels: string[]): string[] {
  return labels.filter(
    (label) => !/\[wave\]/i.test(label) && !/\bWave\b/i.test(label),
  );
}

function drawGestureBadges(
  context: CanvasRenderingContext2D,
  gestureLabels: string[],
  primaryAnchor?: DisplayLabelAnchor,
) {
  if (gestureLabels.length === 0) {
    return;
  }

  const startX = primaryAnchor
    ? clamp(primaryAnchor.x - 80, 12, context.canvas.width - 180)
    : 12;
  const startY = primaryAnchor ? Math.max(12, primaryAnchor.y - 52) : 12;

  gestureLabels.forEach((label, index) => {
    const cleanLabel = formatGestureBadgeText(label);
    const font = "700 13px Segoe UI, sans-serif";
    context.font = font;
    const paddingX = 12;
    const badgeHeight = 28;
    const textWidth = context.measureText(cleanLabel).width;
    const badgeWidth = textWidth + paddingX * 2;
    const x = clamp(startX, 8, context.canvas.width - badgeWidth - 8);
    const y = startY + index * 34;

    context.fillStyle = "rgba(124, 58, 237, 0.9)";
    roundRect(context, x, y, badgeWidth, badgeHeight, 999);
    context.fill();

    context.fillStyle = "#ffffff";
    context.textBaseline = "middle";
    context.fillText(cleanLabel, x + paddingX, y + badgeHeight / 2);
    context.textBaseline = "alphabetic";
  });
}

function formatGestureBadgeText(label: string): string {
  const waveMatch = label.match(/\[wave\]\s*(.+)/i);
  if (waveMatch) {
    return waveMatch[1].trim();
  }
  const handMatch = label.match(/\[hand\]\s*(.+)/i);
  if (handMatch) {
    return handMatch[1].trim();
  }
  const thumbMatch = label.match(/\[thumb\]\s*(.+)/i);
  if (thumbMatch) {
    return thumbMatch[1].trim();
  }

  return label.replace(/^[^:]+:\s*/, "");
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function drawGestureDebugLines(
  context: CanvasRenderingContext2D,
  gestureDebug: GestureDebugInfo[],
) {
  if (gestureDebug.length === 0) {
    return;
  }

  context.fillStyle = "#ffe066";
  context.font = "600 12px Segoe UI, sans-serif";
  gestureDebug.forEach((entry, index) => {
    const y = 56 + index * 16;
    context.fillText(
      `hand_open=${entry.hand_open} dx=${entry.wrist_dx.toFixed(3)} ` +
        `changes=${entry.direction_changes} amp=${entry.amplitude.toFixed(3)} ` +
        `gesture=${entry.detected_gesture ?? "none"}`,
      12,
      y,
    );
  });
}

function drawGestureLabels(context: CanvasRenderingContext2D, gestureLabels: string[]) {
  gestureLabels.forEach((label, index) => {
    const y = 28 + index * 28;
    context.fillStyle = "rgba(170, 0, 170, 0.85)";
    context.fillRect(12, y - 18, Math.min(context.canvas.width - 24, 340), 24);
    context.fillStyle = "#ffffff";
    context.font = "600 14px Segoe UI, sans-serif";
    context.fillText(label, 20, y);
  });
}

function drawDebugFooter(
  context: CanvasRenderingContext2D,
  stats: {
    frameId: number;
    captureResolution: string;
    displayResolution: string;
    processingMs: number;
    frameAgeMs: number;
    previewLabel: string;
    identityTargetFps?: number;
    identityActualFps?: number;
    identitySimilarity?: number | null;
    identityUsername?: string | null;
    responseAgeMs?: number;
    inFlightCount?: number;
    staleCount?: number;
  },
) {
  context.fillStyle = "#00ffff";
  context.font = "600 13px Segoe UI, sans-serif";
  context.fillText(`${stats.previewLabel} | Frame #${stats.frameId}`, 12, context.canvas.height - 134);
  context.fillText(`Capture ${stats.captureResolution}`, 12, context.canvas.height - 116);
  context.fillText(`Display ${stats.displayResolution}`, 12, context.canvas.height - 98);
  context.fillText(
    `Backend ${stats.processingMs.toFixed(0)} ms | Response age ${stats.responseAgeMs?.toFixed(0) ?? stats.frameAgeMs.toFixed(0)} ms`,
    12,
    context.canvas.height - 80,
  );
  if (stats.identityTargetFps !== undefined) {
    context.fillText(
      `Identity target ${stats.identityTargetFps} FPS | Actual ${stats.identityActualFps?.toFixed(1) ?? "0.0"} FPS`,
      12,
      context.canvas.height - 62,
    );
    context.fillText(
      `Identity ${stats.identityUsername ?? "none"}${stats.identitySimilarity != null ? ` (${stats.identitySimilarity.toFixed(2)})` : ""}`,
      12,
      context.canvas.height - 44,
    );
    context.fillText(
      `In-flight ${stats.inFlightCount ?? 0} | Stale ${stats.staleCount ?? 0}`,
      12,
      context.canvas.height - 26,
    );
  }
}

function formatCameraError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Camera permission denied. Allow camera access in the browser and reload.";
    }
    if (error.name === "NotFoundError") {
      return "No camera device found on this machine.";
    }
    if (error.name === "NotReadableError") {
      return "Camera is already in use by another app or browser tab.";
    }
  }

  return error instanceof Error ? error.message : "Unable to start browser camera.";
}
